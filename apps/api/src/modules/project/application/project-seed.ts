import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import { onWorkflowTransition, seedPublishedFlow } from '../../wf/index.js';
import { START_FLOW, START_FLOW_DATA } from '../domain/project-flows.js';
import { followStartFlow } from './project-authorization.js';

// Semilla de Proyectos (B26): en cada empresa, el flujo de autorización de la Dirección para iniciar
// un proyecto sin contrato vigente. Crea lo que falta y nunca toca lo que la empresa cambió. Al
// arrancar el módulo, Proyectos se inscribe para seguir ese trámite en la misma transacción
// (ADR-023).

export async function seedProjects(
  database: Pick<DatabaseService, 'withTenant'>,
  tenantIds: readonly string[],
  clock: Clock,
): Promise<void> {
  for (const tenantId of tenantIds) {
    const context = { tenantId, userId: null, meta: null, at: clock.now() };
    await database.withTenant({ tenantId, userId: null }, (tx) =>
      seedPublishedFlow(tx, context, START_FLOW_DATA),
    );
  }
}

export function followProjectWorkflows(): void {
  onWorkflowTransition(START_FLOW, followStartFlow);
}
