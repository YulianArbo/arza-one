import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import { onWorkflowTransition, seedPublishedFlow } from '../../wf/index.js';
import {
  CHANGE_REQUEST_FLOW,
  CHANGE_REQUEST_FLOW_DATA,
  DISPOSITION_FLOW,
  DISPOSITION_FLOW_DATA,
  VERSION_FLOW,
  VERSION_FLOW_DATA,
} from '../domain/doc-flows.js';
import { FORM_RECORD_ENTITY } from '../domain/form-flows.js';
import { followChangeRequestFlow } from './change-request-flow.js';
import { followDispositionFlow } from './disposition-flow.js';
import { followFormRecordFlow } from './form-record-flow.js';
import { followVersionFlow } from './version-flow.js';

// Los flujos de la gestión documental en el motor (B19): la semilla los publica en cada empresa la
// primera vez, y al arrancar el módulo se inscribe para seguir sus pasos (ADR-023).

/**
 * Publica los flujos de la solicitud, de la versión y de la disposición final (B21) en cada empresa
 * que aún no los tiene.
 */
export async function seedDocWorkflows(
  database: Pick<DatabaseService, 'withTenant'>,
  tenantIds: readonly string[],
  clock: Clock,
): Promise<void> {
  for (const tenantId of tenantIds) {
    const context = { tenantId, userId: null, meta: null, at: clock.now() };
    await database.withTenant({ tenantId, userId: null }, async (tx) => {
      await seedPublishedFlow(tx, context, CHANGE_REQUEST_FLOW_DATA);
      await seedPublishedFlow(tx, context, VERSION_FLOW_DATA);
      await seedPublishedFlow(tx, context, DISPOSITION_FLOW_DATA);
    });
  }
}

/**
 * La solicitud, la versión, los registros diligenciados (B20) y la propuesta de disposición (B21)
 * siguen los pasos de su trámite en la misma transacción.
 */
export function followDocWorkflows(): void {
  onWorkflowTransition(CHANGE_REQUEST_FLOW, followChangeRequestFlow);
  onWorkflowTransition(VERSION_FLOW, followVersionFlow);
  onWorkflowTransition(FORM_RECORD_ENTITY, followFormRecordFlow);
  onWorkflowTransition(DISPOSITION_FLOW, followDispositionFlow);
}
