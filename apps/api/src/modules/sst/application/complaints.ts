import { Inject, Injectable } from '@nestjs/common';
import type { Complaint, FileComplaint, HandleComplaint, OwnComplaint } from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';

import type { SstCoexistenceComplaint } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { FieldCipher } from '../../../platform/crypto/field-cipher.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, nextBusinessCode } from '../../core/index.js';
import { activeMemberIds, isActiveMember } from './committee-membership.js';
import {
  auditSst,
  cipherContext,
  emitSst,
  lockKey,
  notCommitteeMember,
  refOf,
  sstConflict,
  sstInvalid,
  sstNotFound,
  userRefs,
  type SstActor,
  type Target,
} from './sst-support.js';

// Canal confidencial de quejas de convivencia (B37, decisión 9; Ley 1010 de 2006 y Ley 2365 de
// 2024). Cualquier colaborador presenta su queja; solo los integrantes vigentes del Comité de
// Convivencia la leen y la tramitan. Los hechos y la gestión van cifrados, cada lectura queda en
// la auditoría y el aviso al comité no lleva el contenido. Quien se queja ve solo el estado.

const TABLE = 'sst_coexistence_complaints';
const COMPLAINTS = { name: 'Quejas de convivencia laboral', prefix: 'CCL', padding: 4 };

export function ownComplaint(row: SstCoexistenceComplaint): OwnComplaint {
  return {
    id: row.id,
    code: row.code,
    received_at: row.createdAt.toISOString(),
    status: row.status as OwnComplaint['status'],
  };
}

@Injectable()
export class Complaints {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FieldCipher) private readonly cipher: FieldCipher,
  ) {}

  private context(row: { tenantId: string; id: string }, field: string): string {
    return cipherContext(TABLE, row.tenantId, row.id, field);
  }

  async file(
    principal: Principal,
    meta: RequestMeta,
    key: string,
    input: FileComplaint,
  ): Promise<OwnComplaint> {
    const actor: SstActor = { ...principal, at: this.clock.now(), meta };
    return this.database.withTenant(principal, async (tx) => {
      await lockKey(tx, `sst.complaint:${actor.tenantId}:${key}`);
      const existing = await tx.sstCoexistenceComplaint.findUnique({
        where: { tenantId_requestKey: { tenantId: actor.tenantId, requestKey: key } },
      });
      if (existing !== null) {
        if (existing.complainantId !== actor.userId) throw idempotencyKeyReused();
        return ownComplaint(existing);
      }
      return this.store(tx, actor, key, input);
    });
  }

  private async store(
    tx: TenantTransaction,
    actor: SstActor,
    key: string,
    input: FileComplaint,
  ): Promise<OwnComplaint> {
    const id = uuidv7();
    const code = await nextBusinessCode(tx, 'sst.complaint', actor.at, COMPLAINTS);
    const row = await tx.sstCoexistenceComplaint.create({
      data: {
        id,
        tenantId: actor.tenantId,
        code,
        complainantId: actor.userId,
        factsEncrypted: this.cipher.encrypt(
          input.facts,
          this.context({ tenantId: actor.tenantId, id }, 'facts'),
        ),
        requestKey: key,
      },
    });
    await auditSst(tx, actor, {
      action: 'sst.complaint.file',
      entityType: 'sst_coexistence_complaint',
      entityId: id,
      changes: { code },
    });
    const members = await activeMemberIds(tx, 'coexistence', bogotaToday(actor.at));
    await emitSst(tx, actor, 'sst.complaint.received', {
      complaint_id: id,
      code,
      recipients: members.filter((member) => member !== actor.userId),
    });
    return ownComplaint(row);
  }

  async mine(principal: Principal): Promise<OwnComplaint[]> {
    return this.database.withTenant(principal, async (tx) => ownComplaints(tx, principal.userId));
  }

  private async assertMember(tx: TenantTransaction, actor: SstActor): Promise<void> {
    const today = bogotaToday(actor.at);
    if (!(await isActiveMember(tx, actor.userId, 'coexistence', today))) {
      throw notCommitteeMember();
    }
  }

  /** Las quejas completas para el comité; cada lectura queda en la auditoría. */
  async list(principal: Principal, meta: RequestMeta): Promise<Complaint[]> {
    const actor: SstActor = { ...principal, at: this.clock.now(), meta };
    return this.database.withTenant(principal, async (tx) => {
      await this.assertMember(tx, actor);
      const rows = await tx.sstCoexistenceComplaint.findMany({
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 200,
      });
      for (const row of rows) {
        await auditSst(tx, actor, {
          action: 'sst.complaint.read',
          entityType: 'sst_coexistence_complaint',
          entityId: row.id,
          changes: { code: row.code },
        });
      }
      const refs = await userRefs(
        tx,
        rows.map((row) => row.complainantId),
      );
      return rows.map((row) => ({
        ...ownComplaint(row),
        complainant: refOf(refs, row.complainantId),
        facts: this.cipher.decrypt(row.factsEncrypted, this.context(row, 'facts')),
        outcome:
          row.outcomeEncrypted === null
            ? null
            : this.cipher.decrypt(row.outcomeEncrypted, this.context(row, 'outcome')),
        version: row.version,
      }));
    });
  }

  async handle(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: HandleComplaint,
  ): Promise<void> {
    const actor: SstActor = { ...principal, at: this.clock.now(), meta };
    if (input.status === 'closed' && input.outcome === null) {
      throw sstInvalid('Al cerrar la queja, registre la gestión del comité.');
    }
    await this.database.withTenant(principal, async (tx) => {
      await this.assertMember(tx, actor);
      const row = await tx.sstCoexistenceComplaint.findFirst({
        where: { id: target.id, deletedAt: null },
      });
      if (row === null) throw sstNotFound('La queja no existe.');
      if (row.status === 'closed') throw sstConflict('La queja ya está cerrada.');
      const outcome =
        input.outcome === null
          ? row.outcomeEncrypted
          : this.cipher.encrypt(input.outcome, this.context(row, 'outcome'));
      const updated = await tx.sstCoexistenceComplaint.updateMany({
        where: { id: row.id, version: target.version },
        data: {
          status: input.status,
          outcomeEncrypted: outcome,
          handledBy: actor.userId,
          closedAt: input.status === 'closed' ? actor.at : null,
        },
      });
      if (updated.count !== 1) throw versionConflict();
      await auditSst(tx, actor, {
        action: 'sst.complaint.handle',
        entityType: 'sst_coexistence_complaint',
        entityId: row.id,
        changes: { status: { from: row.status, to: input.status } },
      });
    });
  }
}

export async function ownComplaints(
  tx: TenantTransaction,
  userId: string,
): Promise<OwnComplaint[]> {
  const rows = await tx.sstCoexistenceComplaint.findMany({
    where: { complainantId: userId, deletedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: 50,
  });
  return rows.map(ownComplaint);
}
