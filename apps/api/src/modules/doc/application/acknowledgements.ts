import { Inject, Injectable } from '@nestjs/common';
import type { AcknowledgementReport, AcknowledgementRequestResponse } from '@arza/contracts';

import type { DocAcknowledgement, DocDocument } from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { positionsById } from '../../core/index.js';
import { peopleById, positionOfUser } from '../../iam/index.js';
import { actorOf, auditDoc, readerOf, type DocReader } from './doc-support.js';
import { findChangeableDocument, findVisibleDocument } from './documents.js';
import { requestReading } from './reading-requests.js';
import { notAcknowledgeable } from './request-messages.js';

// Constancia de lectura (B19, ficha 17.4): cada persona confirma que leyó la versión vigente; quien
// ve todos los documentos ve el informe por cargo, y quien publica puede volver a pedir la lectura.

type Positions = Awaited<ReturnType<typeof positionsById>>;
type Section = AcknowledgementReport['positions'][number];

function iso(date: Date | null): string | null {
  return date === null ? null : date.toISOString();
}

async function currentVersionOf(tx: TenantTransaction, document: DocDocument) {
  if (document.status !== 'current' || document.currentVersionId === null) return null;
  return tx.docVersion.findFirst({ where: { id: document.currentVersionId, status: 'current' } });
}

function sections(
  rows: readonly DocAcknowledgement[],
  people: ReadonlyMap<string, string>,
  positions: Positions,
): Section[] {
  const byPosition = new Map<string | null, Section['readers']>();
  for (const row of rows) {
    const readers = byPosition.get(row.positionId) ?? [];
    const name = people.get(row.userId) ?? 'Persona retirada';
    readers.push({
      user: { id: row.userId, name },
      requested_at: iso(row.requestedAt),
      acknowledged_at: iso(row.acknowledgedAt),
    });
    byPosition.set(row.positionId, readers);
  }
  return [...byPosition].map(([positionId, readers]) => {
    const position = positionId === null ? undefined : positions.get(positionId);
    return {
      position: position === undefined ? null : { id: position.id, name: position.name },
      readers,
    };
  });
}

async function reportOf(
  tx: TenantTransaction,
  reader: DocReader,
  document: DocDocument,
): Promise<AcknowledgementReport> {
  const version = await currentVersionOf(tx, document);
  const rows =
    version === null
      ? []
      : await tx.docAcknowledgement.findMany({
          where: { versionId: version.id, deletedAt: null },
          orderBy: { createdAt: 'asc' },
        });
  const mine = rows.find((row) => row.userId === reader.userId);
  const visible = reader.readsAll ? rows : [];
  const people = await peopleById(
    tx,
    visible.map((row) => row.userId),
  );
  const names = new Map([...people].map(([id, p]) => [id, p.displayName ?? p.email]));
  const positionIds = visible.flatMap((row) => (row.positionId === null ? [] : [row.positionId]));
  return {
    document_id: document.id,
    version: version === null ? null : { id: version.id, label: version.versionLabel },
    mine:
      mine === undefined
        ? null
        : { requested_at: iso(mine.requestedAt), acknowledged_at: iso(mine.acknowledgedAt) },
    can_acknowledge: version !== null && (mine?.acknowledgedAt ?? null) === null,
    totals: {
      requested: rows.filter((row) => row.requestedAt !== null).length,
      acknowledged: rows.filter((row) => row.acknowledgedAt !== null).length,
    },
    positions: sections(visible, names, await positionsById(tx, positionIds)),
  };
}

/** Quien confirma sin que se le hubiera pedido queda con su cargo de hoy. */
async function createConfirmed(
  tx: TenantTransaction,
  row: { tenantId: string; versionId: string; userId: string; documentId: string; at: Date },
): Promise<DocAcknowledgement> {
  return tx.docAcknowledgement.create({
    data: {
      tenantId: row.tenantId,
      documentId: row.documentId,
      versionId: row.versionId,
      userId: row.userId,
      positionId: await positionOfUser(tx, row.userId),
      acknowledgedAt: row.at,
    },
  });
}

@Injectable()
export class AcknowledgementsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async report(
    principal: Principal,
    ability: AppAbility,
    documentId: string,
  ): Promise<AcknowledgementReport> {
    return this.database.withTenant(principal, async (tx) => {
      const reader = await readerOf(tx, principal, ability);
      return reportOf(tx, reader, await findVisibleDocument(tx, reader, documentId));
    });
  }

  /** La persona confirma que leyó la versión vigente. Confirmar dos veces no cambia nada. */
  async confirm(
    principal: Principal,
    ability: AppAbility,
    documentId: string,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = actorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const reader = await readerOf(tx, principal, ability);
      const document = await findChangeableDocument(tx, reader, documentId);
      const version = await currentVersionOf(tx, document);
      if (version === null) throw notAcknowledgeable();
      const where = { versionId: version.id, userId: principal.userId, deletedAt: null };
      const existing = await tx.docAcknowledgement.findFirst({ where });
      if ((existing?.acknowledgedAt ?? null) !== null) return;
      const row =
        existing === null
          ? await createConfirmed(tx, { ...actor, ...where, documentId: document.id })
          : await tx.docAcknowledgement.update({
              where: { id: existing.id },
              data: { acknowledgedAt: actor.at },
            });
      await auditDoc(tx, actor, {
        action: 'doc.acknowledgement.confirm',
        entityType: 'doc_acknowledgement',
        entityId: row.id,
        changes: { code: document.code, label: version.versionLabel },
      });
    });
  }

  /** Vuelve a pedir la lectura de la versión vigente a los cargos destinatarios. */
  async request(
    principal: Principal,
    ability: AppAbility,
    documentId: string,
    meta: RequestMeta,
  ): Promise<AcknowledgementRequestResponse> {
    const actor = actorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const reader = await readerOf(tx, principal, ability);
      const document = await findChangeableDocument(tx, reader, documentId);
      const version = await currentVersionOf(tx, document);
      if (version === null) throw notAcknowledgeable();
      const requested = await requestReading(tx, actor, { document, version }, { audited: true });
      return { requested };
    });
  }
}
