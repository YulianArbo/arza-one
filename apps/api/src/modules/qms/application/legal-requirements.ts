import { Inject, Injectable } from '@nestjs/common';
import {
  LEGAL_FILE_COLUMNS,
  legalPeriodLabel,
  legalPeriodStart,
  type LegalEvaluation,
  type LegalRequirementList,
  type QmsCodeResponse,
  type SaveLegalRequirement,
} from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { toCsv } from '../../../platform/export/csv.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, nextPlainCode } from '../../core/index.js';
import { evaluationView, legalFileRow, loadRequirements } from './legal-views.js';
import {
  assertPerson,
  assertProcess,
  auditQms,
  qmsActorOf,
  qmsNotFound,
  userRefs,
  type QmsActor,
  type Target,
} from './qms-support.js';

// Normograma (RE-DG-001; B46, ficha 17.17 y decisión 6): Calidad registra los requisitos legales,
// la Dirección, Calidad y el Auditor los consultan y lo descargan. Toda escritura deja su
// auditoría en la misma transacción.

export const LEGAL_REQUIREMENTS = {
  key: 'qms.legal_requirement',
  name: 'Normograma',
  prefix: 'NRM',
  padding: 3,
};

export interface RequirementData {
  readonly normType: string;
  readonly norm: string;
  readonly issuer: string;
  readonly article: string | null;
  readonly requirement: string;
  readonly complianceMeans: string | null;
  readonly processId: string | null;
  readonly responsibleId: string | null;
  readonly applies: boolean;
}

export function requirementData(input: SaveLegalRequirement): RequirementData {
  return {
    normType: input.norm_type,
    norm: input.norm,
    issuer: input.issuer,
    article: input.article,
    requirement: input.requirement,
    complianceMeans: input.compliance_means,
    processId: input.process_id,
    responsibleId: input.responsible_id,
    applies: input.applies,
  };
}

async function assertRequirementRefs(
  tx: TenantTransaction,
  input: Pick<SaveLegalRequirement, 'process_id' | 'responsible_id'>,
): Promise<void> {
  await assertProcess(tx, input.process_id);
  if (input.responsible_id !== null) await assertPerson(tx, input.responsible_id);
}

/** Crea el requisito con su código NRM-NNN y deja su auditoría. */
export async function insertRequirement(
  tx: TenantTransaction,
  actor: QmsActor,
  input: SaveLegalRequirement,
): Promise<QmsCodeResponse> {
  const code = await nextPlainCode(tx, LEGAL_REQUIREMENTS);
  const row = await tx.qmsLegalRequirement.create({
    data: { tenantId: actor.tenantId, code, ...requirementData(input) },
  });
  await auditQms(tx, actor, {
    action: 'qms.legal_requirement.create',
    entityType: 'qms_legal_requirement',
    entityId: row.id,
    changes: { code, norm: input.norm, article: input.article, applies: input.applies },
  });
  return { id: row.id, code };
}

@Injectable()
export class LegalRequirements {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal): Promise<LegalRequirementList> {
    const today = bogotaToday(this.clock.now());
    const data = await this.database.withTenant(principal, (tx) => loadRequirements(tx, today));
    return { data, current_period: legalPeriodLabel(legalPeriodStart(today)) };
  }

  /** Todas las evaluaciones de un requisito, de la más reciente a la más antigua. */
  async evaluations(principal: Principal, id: string): Promise<LegalEvaluation[]> {
    return this.database.withTenant(principal, async (tx) => {
      const exists = await tx.qmsLegalRequirement.count({ where: { id, deletedAt: null } });
      if (exists === 0) throw qmsNotFound('El requisito no existe.');
      const rows = await tx.qmsLegalEvaluation.findMany({
        where: { requirementId: id, deletedAt: null },
        orderBy: [{ evaluatedOn: 'desc' }, { id: 'desc' }],
        include: { action: { select: { id: true, code: true } } },
      });
      const people = await userRefs(
        tx,
        rows.map((row) => row.evaluatedBy),
      );
      return rows.map((row) => evaluationView(row, people));
    });
  }

  /** El normograma en CSV para Excel; la descarga queda en la auditoría. */
  async export(
    principal: Principal,
    meta: RequestMeta,
  ): Promise<{ readonly fileName: string; readonly content: string }> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    const { data } = await this.list(principal);
    const content = toCsv(LEGAL_FILE_COLUMNS, data.map(legalFileRow));
    await this.database.withTenant(principal, async (tx) => {
      await auditQms(tx, actor, {
        action: 'qms.legal_requirement.export',
        entityType: 'qms_legal_requirement',
        entityId: actor.tenantId,
        changes: { rows: data.length },
      });
    });
    return { fileName: `normograma-${bogotaToday(actor.at)}.csv`, content };
  }

  async create(
    principal: Principal,
    meta: RequestMeta,
    input: SaveLegalRequirement,
  ): Promise<QmsCodeResponse> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    return this.database.withTenant(principal, async (tx) => {
      await assertRequirementRefs(tx, input);
      return insertRequirement(tx, actor, input);
    });
  }

  async update(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: SaveLegalRequirement,
  ): Promise<void> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      await assertRequirementRefs(tx, input);
      const updated = await tx.qmsLegalRequirement.updateMany({
        where: { id: target.id, version: target.version, deletedAt: null },
        data: requirementData(input),
      });
      if (updated.count !== 1) {
        const exists = await tx.qmsLegalRequirement.count({
          where: { id: target.id, deletedAt: null },
        });
        throw exists === 0 ? qmsNotFound('El requisito no existe.') : versionConflict();
      }
      await auditQms(tx, actor, {
        action: 'qms.legal_requirement.update',
        entityType: 'qms_legal_requirement',
        entityId: target.id,
        changes: { norm: input.norm, article: input.article, applies: input.applies },
      });
    });
  }
}
