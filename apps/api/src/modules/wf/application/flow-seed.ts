import type { StateInput, TransitionInput } from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { writeFlowParts } from '../infrastructure/flow-store.js';
import { auditWf, type WfContext } from './wf-context.js';

// Flujos que traen los módulos (ADR-011): cada módulo define como datos el flujo de sus registros
// y el motor lo crea publicado la primera vez. Después lo cambia Administración › Flujos, sin
// programar; la semilla nunca toca un flujo que ya existe.

export interface SeedFlow {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly entityType: string;
  readonly states: readonly StateInput[];
  readonly transitions: readonly TransitionInput[];
  /** Acción de la auditoría; la del flujo de demostración es «wf.demo.seed». */
  readonly auditAction?: string;
}

/** Crea y publica la versión 1 del flujo si la empresa aún no lo tiene. Dice si lo creó. */
export async function seedPublishedFlow(
  tx: TenantTransaction,
  context: WfContext,
  flow: SeedFlow,
): Promise<boolean> {
  if ((await tx.workflowDefinition.count({ where: { key: flow.key } })) > 0) return false;
  const definition = await tx.workflowDefinition.create({
    data: {
      tenantId: context.tenantId,
      key: flow.key,
      versionNumber: 1,
      name: flow.name,
      description: flow.description,
      entityType: flow.entityType,
    },
  });
  const owner = { tenantId: context.tenantId, definitionId: definition.id, now: context.at };
  await writeFlowParts(tx, owner, { states: [...flow.states], transitions: [...flow.transitions] });
  await tx.workflowDefinition.update({
    where: { id: definition.id },
    data: { status: 'published', publishedAt: context.at },
  });
  await auditWf(tx, context, {
    action: flow.auditAction ?? 'wf.definition.seed',
    entityType: 'wf_definition',
    entityId: definition.id,
    changes: { key: flow.key, version: 1 },
  });
  return true;
}
