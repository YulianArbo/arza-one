import { Inject, Injectable } from '@nestjs/common';
import type {
  AddCommitteeMember,
  Committee,
  CommitteeMember,
  CommitteeMinute,
  EndCommitteeMember,
  RecordCommitteeMinute,
} from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';

import type { SstCommitteeMember } from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission } from '../../../platform/access/ability.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { FieldCipher } from '../../../platform/crypto/field-cipher.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { isActiveInternalUser } from '../../iam/index.js';
import { isActiveMember } from './committee-membership.js';
import {
  assertFile,
  auditSst,
  cipherContext,
  dateOf,
  notCommitteeMember,
  refOf,
  sstInvalid,
  sstNotFound,
  userRefs,
  type SstActor,
  type SstViewer,
  type Target,
} from './sst-support.js';

// Comités: COPASST (o Vigía) y Convivencia Laboral (B37, decisión 8). SST registra a los
// integrantes. Las actas del COPASST las ven sus integrantes y quien tiene sst.committee.read; las
// de Convivencia, solo sus integrantes vigentes. El resumen del acta va cifrado y cada consulta de
// las actas de Convivencia queda en la auditoría.

const TABLE = 'sst_committee_minutes';

function memberView(
  row: SstCommitteeMember,
  person: { readonly id: string; readonly name: string },
  today: string,
): CommitteeMember {
  const until = dateOf(row.untilOn);
  const from = toCalendarDate(row.fromOn);
  return {
    id: row.id,
    committee: row.committee as Committee,
    person,
    role: row.role as CommitteeMember['role'],
    represents: row.represents as CommitteeMember['represents'],
    from_on: from,
    until_on: until,
    active: from <= today && (until === null || until >= today),
    version: row.version,
  };
}

@Injectable()
export class Committees {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FieldCipher) private readonly cipher: FieldCipher,
  ) {}

  async members(viewer: SstViewer): Promise<CommitteeMember[]> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(viewer.principal, async (tx) => {
      const rows = await tx.sstCommitteeMember.findMany({
        where: { deletedAt: null },
        orderBy: [{ committee: 'asc' }, { fromOn: 'desc' }, { id: 'asc' }],
        take: 200,
      });
      const refs = await userRefs(
        tx,
        rows.map((row) => row.userId),
      );
      return rows.map((row) => memberView(row, refOf(refs, row.userId), today));
    });
  }

  async addMember(
    viewer: SstViewer,
    meta: RequestMeta,
    input: AddCommitteeMember,
  ): Promise<string> {
    const actor: SstActor = { ...viewer.principal, at: this.clock.now(), meta };
    return this.database.withTenant(viewer.principal, async (tx) => {
      if (!(await isActiveInternalUser(tx, input.user_id))) {
        throw sstInvalid('La persona no es un colaborador activo.');
      }
      const row = await tx.sstCommitteeMember.create({
        data: {
          tenantId: actor.tenantId,
          committee: input.committee,
          userId: input.user_id,
          role: input.role,
          represents: input.represents,
          fromOn: fromCalendarDate(input.from_on),
          untilOn: input.until_on === null ? null : fromCalendarDate(input.until_on),
        },
      });
      await auditSst(tx, actor, {
        action: 'sst.committee.add_member',
        entityType: 'sst_committee_member',
        entityId: row.id,
        changes: { committee: input.committee, user_id: input.user_id, role: input.role },
      });
      return row.id;
    });
  }

  async endMember(
    viewer: SstViewer,
    meta: RequestMeta,
    target: Target,
    input: EndCommitteeMember,
  ): Promise<void> {
    const actor: SstActor = { ...viewer.principal, at: this.clock.now(), meta };
    await this.database.withTenant(viewer.principal, async (tx) => {
      const row = await tx.sstCommitteeMember.findFirst({
        where: { id: target.id, deletedAt: null },
      });
      if (row === null) throw sstNotFound('El integrante no existe.');
      if (input.until_on <= toCalendarDate(row.fromOn)) {
        throw sstInvalid('El periodo termina después de empezar.');
      }
      const updated = await tx.sstCommitteeMember.updateMany({
        where: { id: row.id, version: target.version },
        data: { untilOn: fromCalendarDate(input.until_on) },
      });
      if (updated.count !== 1) throw versionConflict();
      await auditSst(tx, actor, {
        action: 'sst.committee.end_member',
        entityType: 'sst_committee_member',
        entityId: row.id,
        changes: { until_on: input.until_on },
      });
    });
  }

  /** COPASST: integrantes o quien lee actas; Convivencia: solo integrantes vigentes. */
  private async assertAccess(
    tx: TenantTransaction,
    viewer: SstViewer,
    committee: Committee,
    write: boolean,
  ): Promise<void> {
    const today = bogotaToday(this.clock.now());
    if (await isActiveMember(tx, viewer.principal.userId, committee, today)) return;
    const permission = write ? 'sst.committee.manage' : 'sst.committee.read';
    if (committee === 'copasst' && hasUnconditionalPermission(viewer.ability, permission)) return;
    throw notCommitteeMember();
  }

  async minutes(
    viewer: SstViewer,
    meta: RequestMeta,
    committee: Committee,
  ): Promise<CommitteeMinute[]> {
    const actor: SstActor = { ...viewer.principal, at: this.clock.now(), meta };
    return this.database.withTenant(viewer.principal, async (tx) => {
      await this.assertAccess(tx, viewer, committee, false);
      const rows = await tx.sstCommitteeMinute.findMany({
        where: { committee, deletedAt: null },
        orderBy: [{ meetingOn: 'desc' }, { id: 'asc' }],
        take: 200,
      });
      for (const row of committee === 'coexistence' ? rows : []) {
        await auditSst(tx, actor, {
          action: 'sst.committee.read_minute',
          entityType: 'sst_committee_minute',
          entityId: row.id,
          changes: { committee },
        });
      }
      const refs = await userRefs(
        tx,
        rows.map((row) => row.recordedBy),
      );
      return rows.map((row) => ({
        id: row.id,
        committee,
        meeting_on: toCalendarDate(row.meetingOn),
        summary: this.cipher.decrypt(
          row.summaryEncrypted,
          cipherContext(TABLE, row.tenantId, row.id, 'summary'),
        ),
        file_id: row.fileId,
        recorded_by: refOf(refs, row.recordedBy),
        version: row.version,
      }));
    });
  }

  async recordMinute(
    viewer: SstViewer,
    meta: RequestMeta,
    input: RecordCommitteeMinute,
  ): Promise<string> {
    const actor: SstActor = { ...viewer.principal, at: this.clock.now(), meta };
    if (input.meeting_on > bogotaToday(actor.at)) {
      throw sstInvalid('La fecha de la reunión no puede ser futura.');
    }
    return this.database.withTenant(viewer.principal, async (tx) => {
      await this.assertAccess(tx, viewer, input.committee, true);
      await assertFile(tx, viewer.principal, input.file_id);
      const id = uuidv7();
      const context = cipherContext(TABLE, actor.tenantId, id, 'summary');
      await tx.sstCommitteeMinute.create({
        data: {
          id,
          tenantId: actor.tenantId,
          committee: input.committee,
          meetingOn: fromCalendarDate(input.meeting_on),
          summaryEncrypted: this.cipher.encrypt(input.summary, context),
          fileId: input.file_id,
          recordedBy: actor.userId,
        },
      });
      await auditSst(tx, actor, {
        action: 'sst.committee.record_minute',
        entityType: 'sst_committee_minute',
        entityId: id,
        changes: { committee: input.committee, meeting_on: input.meeting_on },
      });
      return id;
    });
  }
}
