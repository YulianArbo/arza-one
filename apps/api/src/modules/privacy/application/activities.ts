import { Inject, Injectable } from '@nestjs/common';
import {
  dataCategorySchema,
  holderTypeSchema,
  recordStatusSchema,
  type Activity,
  type CreateActivityRequest,
  type UpdateActivityRequest,
} from '@arza/contracts';

import type {
  ActivityProcessor,
  DataProcessor,
  ProcessingActivity,
} from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { hasSensitiveData } from '../domain/privacy-rules.js';
import { PARTY_DIRECTORY, type PartyDirectory } from './party-directory.js';
import { activityNotFound, processorInvalid } from './privacy-messages.js';
import { actorOf, auditPrivacy, partyNames } from './privacy-support.js';

// Registro de actividades de tratamiento (Ley 1581, art. 4; numeral 20.1): qué datos, de qué
// titulares, para qué, con qué fundamento, por cuánto tiempo y con qué encargados.

type ActivityRow = ProcessingActivity & {
  processors: (ActivityProcessor & { processor: DataProcessor })[];
};

const WITH_PROCESSORS = {
  processors: { where: { deletedAt: null }, include: { processor: true } },
} as const;

function activityView(row: ActivityRow, nameOf: (id: string) => string | null): Activity {
  const categories = row.dataCategories.map((value) => dataCategorySchema.parse(value));
  return {
    id: row.id,
    name: row.name,
    purpose: row.purpose,
    data_categories: categories,
    holder_types: row.holderTypes.map((value) => holderTypeSchema.parse(value)),
    legal_basis: row.legalBasis,
    retention: row.retention,
    international_transfers: row.internationalTransfers,
    processors: row.processors.map((link) => ({
      id: link.processorId,
      name: nameOf(link.processor.partyId),
    })),
    sensitive: hasSensitiveData(categories),
    status: recordStatusSchema.parse(row.status),
    version: row.version,
  };
}

function columnsOf(input: CreateActivityRequest) {
  return {
    name: input.name,
    purpose: input.purpose,
    dataCategories: input.data_categories,
    holderTypes: input.holder_types,
    legalBasis: input.legal_basis,
    retention: input.retention,
    internationalTransfers: input.international_transfers,
  };
}

function auditFields(row: ProcessingActivity, processorIds: readonly string[]) {
  return {
    name: row.name,
    purpose: row.purpose,
    data_categories: row.dataCategories.join(','),
    holder_types: row.holderTypes.join(','),
    legal_basis: row.legalBasis,
    retention: row.retention,
    international_transfers: row.internationalTransfers,
    processor_ids: [...processorIds].sort().join(','),
    status: row.status,
  };
}

async function assertProcessors(tx: TenantTransaction, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const found = await tx.dataProcessor.count({ where: { id: { in: [...ids] }, deletedAt: null } });
  if (found !== ids.length) throw processorInvalid();
}

/** Deja exactamente los encargados pedidos: retira los que salen y recupera los que vuelven. */
async function syncProcessors(
  tx: TenantTransaction,
  tenantId: string,
  activityId: string,
  wanted: readonly string[],
  at: Date,
): Promise<void> {
  const links = await tx.activityProcessor.findMany({ where: { activityId } });
  for (const link of links) {
    const keep = wanted.includes(link.processorId);
    if (keep === (link.deletedAt === null)) continue;
    await tx.activityProcessor.update({
      where: { id: link.id },
      data: { deletedAt: keep ? null : at },
    });
  }
  const known = new Set(links.map((link) => link.processorId));
  const missing = wanted.filter((id) => !known.has(id));
  await tx.activityProcessor.createMany({
    data: missing.map((processorId) => ({ tenantId, activityId, processorId })),
  });
}

async function findActivity(tx: TenantTransaction, id: string): Promise<ActivityRow> {
  const row = await tx.processingActivity.findFirst({
    where: { id, deletedAt: null },
    include: WITH_PROCESSORS,
  });
  if (row === null) throw activityNotFound();
  return row;
}

@Injectable()
export class ActivitiesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(PARTY_DIRECTORY) private readonly parties: PartyDirectory,
  ) {}

  async list(principal: Principal): Promise<Activity[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.processingActivity.findMany({
        where: { deletedAt: null },
        include: WITH_PROCESSORS,
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
      });
      return this.views(tx, rows);
    });
  }

  async get(principal: Principal, id: string): Promise<Activity> {
    return this.database.withTenant(principal, async (tx) => {
      const [view] = await this.views(tx, [await findActivity(tx, id)]);
      if (view === undefined) throw activityNotFound();
      return view;
    });
  }

  async create(
    principal: Principal,
    input: CreateActivityRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = actorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      await assertProcessors(tx, input.processor_ids);
      const row = await tx.processingActivity.create({
        data: { tenantId: principal.tenantId, ...columnsOf(input) },
      });
      await syncProcessors(tx, principal.tenantId, row.id, input.processor_ids, actor.at);
      await auditPrivacy(tx, actor, {
        action: 'privacy.activity.create',
        entityType: 'prv_processing_activity',
        entityId: row.id,
        changes: auditFields(row, input.processor_ids),
      });
      return row.id;
    });
  }

  async update(
    principal: Principal,
    id: string,
    version: number,
    input: UpdateActivityRequest,
    meta: RequestMeta,
  ): Promise<Activity> {
    const actor = actorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const before = await findActivity(tx, id);
      if (before.version !== version) throw versionConflict();
      await assertProcessors(tx, input.processor_ids);
      const after = await tx.processingActivity.update({
        where: { id },
        data: { ...columnsOf(input), status: input.status },
      });
      await syncProcessors(tx, principal.tenantId, id, input.processor_ids, actor.at);
      const beforeIds = before.processors.map((link) => link.processorId);
      await auditPrivacy(tx, actor, {
        action: 'privacy.activity.update',
        entityType: 'prv_processing_activity',
        entityId: id,
        changes: changesBetween(
          auditFields(before, beforeIds),
          auditFields(after, input.processor_ids),
        ),
      });
      const [view] = await this.views(tx, [await findActivity(tx, id)]);
      if (view === undefined) throw activityNotFound();
      return view;
    });
  }

  private async views(tx: TenantTransaction, rows: readonly ActivityRow[]): Promise<Activity[]> {
    const partyIds = rows.flatMap((row) => row.processors.map((link) => link.processor.partyId));
    const nameOf = await partyNames(tx, this.parties, partyIds);
    return rows.map((row) => activityView(row, nameOf));
  }
}
