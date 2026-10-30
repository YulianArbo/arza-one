import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { onWorkflowTransition, seedPublishedFlow } from '../../wf/index.js';
import {
  AMENDMENT_FLOW,
  AMENDMENT_FLOW_DATA,
  CONTRACT_FLOW,
  CONTRACT_FLOW_DATA,
  EXPIRY_FLOW_DATA,
} from '../domain/contract-flows.js';
import { SEED_CLAUSES, SEED_TEMPLATES, type SeedTemplate } from '../domain/library-seed-data.js';
import { followAmendmentFlow } from './amendment-flow.js';
import { followContractFlow } from './contract-flow.js';
import { recordContractChange, systemActor } from './contract-support.js';

// Semilla de Contratos (B24): en cada empresa, los flujos de aprobación y de vencimiento, la
// biblioteca inicial de cláusulas y las plantillas CT-COM y OS-COM. Crea lo que falta y nunca toca lo
// que la empresa cambió, así que se puede correr de nuevo. Al arrancar el módulo, Contratos se
// inscribe para seguir los pasos de sus trámites en la misma transacción (ADR-023).

const FLOWS = [CONTRACT_FLOW_DATA, AMENDMENT_FLOW_DATA, EXPIRY_FLOW_DATA];

async function seedClauses(tx: TenantTransaction, tenantId: string, at: Date): Promise<void> {
  const existing = new Set(
    (await tx.ctrClause.findMany({ select: { key: true } })).map((row) => row.key),
  );
  const missing = SEED_CLAUSES.filter((clause) => !existing.has(clause.key));
  if (missing.length === 0) return;
  await tx.ctrClause.createMany({
    data: missing.map((clause) => ({
      tenantId,
      key: clause.key,
      clauseVersion: 1,
      title: clause.title,
      body: clause.body,
      numbered: clause.numbered,
      legalValidated: false,
      approvedAt: at,
    })),
  });
  await recordContractChange(tx, systemActor(tenantId, at), {
    action: 'contract.clause.seed',
    event: 'contract.clause.seeded',
    // La biblioteca es una por empresa: el evento queda a nombre de la empresa.
    entityType: 'ctr_clause_library',
    entityId: tenantId,
    changes: { keys: missing.map((clause) => clause.key), legal_validated: false },
  });
}

async function seedTemplate(
  tx: TenantTransaction,
  tenantId: string,
  template: SeedTemplate,
  at: Date,
): Promise<void> {
  if ((await tx.ctrTemplate.count({ where: { code: template.code } })) > 0) return;
  const created = await tx.ctrTemplate.create({
    data: {
      tenantId,
      code: template.code,
      name: template.name,
      kind: template.kind,
      formatVersion: '01',
    },
  });
  await tx.ctrTemplateClause.createMany({
    data: template.clauses.map((entry, index) => ({
      tenantId,
      templateId: created.id,
      position: index + 1,
      clauseKey: entry.replace('?', ''),
      required: !entry.endsWith('?'),
    })),
  });
  await recordContractChange(tx, systemActor(tenantId, at), {
    action: 'contract.template.seed',
    event: 'contract.template.seeded',
    entityType: 'ctr_template',
    entityId: created.id,
    changes: { code: template.code, clauses: template.clauses.length },
  });
}

export async function seedContracts(
  database: Pick<DatabaseService, 'withTenant'>,
  tenantIds: readonly string[],
  clock: Clock,
): Promise<void> {
  for (const tenantId of tenantIds) {
    const scope = { tenantId, userId: null };
    for (const flow of FLOWS) {
      const context = { tenantId, userId: null, meta: null, at: clock.now() };
      await database.withTenant(scope, (tx) => seedPublishedFlow(tx, context, flow));
    }
    await database.withTenant(scope, (tx) => seedClauses(tx, tenantId, clock.now()));
    for (const template of SEED_TEMPLATES) {
      await database.withTenant(scope, (tx) => seedTemplate(tx, tenantId, template, clock.now()));
    }
  }
}

export function followContractWorkflows(): void {
  onWorkflowTransition(CONTRACT_FLOW, followContractFlow);
  onWorkflowTransition(AMENDMENT_FLOW, followAmendmentFlow);
}
