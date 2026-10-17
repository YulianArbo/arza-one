import { Inject, Injectable } from '@nestjs/common';
import {
  recordStatusSchema,
  type CreateProcessorRequest,
  type Processor,
  type UpdateProcessorRequest,
} from '@arza/contracts';

import type { DataProcessor } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { isAttachableFile } from '../../doc/index.js';
import { PARTY_DIRECTORY, type PartyDirectory } from './party-directory.js';
import { evidenceInvalid, processorInvalid, processorNotFound } from './privacy-messages.js';
import { actorOf, auditPrivacy, partyNames, type PrivacyActor } from './privacy-support.js';

// Encargados y proveedores con acceso a datos personales (Ley 1581, arts. 17, 18 y 26). Todo
// encargado debe tener contrato de transmisión: se puede registrar mientras se firma, pero aparece
// con la alerta «Falta contrato de transmisión».

function processorView(row: DataProcessor, name: string | null): Processor {
  return {
    id: row.id,
    party: { id: row.partyId, name },
    service: row.service,
    country: row.country,
    contract_file_id: row.contractFileId,
    has_contract: row.contractFileId !== null,
    review_on: toCalendarDate(row.reviewOn),
    status: recordStatusSchema.parse(row.status),
    version: row.version,
  };
}

function auditFields(row: DataProcessor) {
  return {
    service: row.service,
    country: row.country,
    contract_file_id: row.contractFileId,
    review_on: toCalendarDate(row.reviewOn),
    status: row.status,
  };
}

async function findProcessor(tx: TenantTransaction, id: string): Promise<DataProcessor> {
  const row = await tx.dataProcessor.findFirst({ where: { id, deletedAt: null } });
  if (row === null) throw processorNotFound();
  return row;
}

@Injectable()
export class ProcessorsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(PARTY_DIRECTORY) private readonly parties: PartyDirectory,
  ) {}

  async list(principal: Principal): Promise<Processor[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.dataProcessor.findMany({
        where: { deletedAt: null },
        orderBy: [{ status: 'asc' }, { reviewOn: 'asc' }],
      });
      const nameOf = await partyNames(
        tx,
        this.parties,
        rows.map((row) => row.partyId),
      );
      return rows.map((row) => processorView(row, nameOf(row.partyId)));
    });
  }

  async get(principal: Principal, id: string): Promise<Processor> {
    return this.database.withTenant(principal, async (tx) => {
      const row = await findProcessor(tx, id);
      const nameOf = await partyNames(tx, this.parties, [row.partyId]);
      return processorView(row, nameOf(row.partyId));
    });
  }

  async create(
    principal: Principal,
    input: CreateProcessorRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = actorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const party = (await this.parties.describe(tx, [input.party_id])).get(input.party_id);
      if (party?.kind !== 'organization' || !party.isCurrent) throw processorInvalid();
      await this.assertContract(tx, actor, input.contract_file_id, null);
      const row = await tx.dataProcessor.create({
        data: {
          tenantId: principal.tenantId,
          partyId: input.party_id,
          service: input.service,
          country: input.country,
          contractFileId: input.contract_file_id,
          reviewOn: fromCalendarDate(input.review_on),
        },
      });
      await auditPrivacy(tx, actor, {
        action: 'privacy.processor.create',
        entityType: 'prv_processor',
        entityId: row.id,
        changes: { party_id: row.partyId, ...auditFields(row) },
      });
      return row.id;
    });
  }

  async update(
    principal: Principal,
    id: string,
    version: number,
    input: UpdateProcessorRequest,
    meta: RequestMeta,
  ): Promise<Processor> {
    const actor = actorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const before = await findProcessor(tx, id);
      if (before.version !== version) throw versionConflict();
      await this.assertContract(tx, actor, input.contract_file_id, before.contractFileId);
      const after = await tx.dataProcessor.update({
        where: { id },
        data: {
          service: input.service,
          country: input.country,
          contractFileId: input.contract_file_id,
          reviewOn: fromCalendarDate(input.review_on),
          status: input.status,
        },
      });
      await auditPrivacy(tx, actor, {
        action: 'privacy.processor.update',
        entityType: 'prv_processor',
        entityId: id,
        changes: changesBetween(auditFields(before), auditFields(after)),
      });
      const nameOf = await partyNames(tx, this.parties, [after.partyId]);
      return processorView(after, nameOf(after.partyId));
    });
  }

  /** Un contrato nuevo debe ser un archivo propio ya revisado; el que ya estaba se conserva. */
  private async assertContract(
    tx: TenantTransaction,
    actor: PrivacyActor,
    fileId: string | null,
    current: string | null,
  ): Promise<void> {
    if (fileId === null || fileId === current || actor.principal === null) return;
    if (!(await isAttachableFile(tx, actor.principal, fileId))) throw evidenceInvalid();
  }
}
