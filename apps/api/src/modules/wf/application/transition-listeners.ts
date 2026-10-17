import type { WorkflowFacts } from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { WfContext } from './wf-context.js';

// Módulos que siguen los pasos de sus registros (ADR-023). Cuando un trámite cambia de estado, el
// módulo dueño del registro se entera dentro de la misma transacción, venga el paso de su propia
// pantalla o de «Mis tareas»: así el registro y su trámite nunca quedan en desacuerdo. Si el
// módulo rechaza el paso, se revierte todo. El motor no conoce a los módulos: ellos se inscriben.

export interface TransitionNotice {
  readonly instanceId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly fromState: string;
  readonly toState: string;
  readonly action: string;
  readonly comment: string | null;
  /** A nombre de quién actúa la persona, por una delegación. */
  readonly onBehalfOf: string | null;
  readonly facts: WorkflowFacts;
  /** El estado al que llega es final: el trámite terminó. */
  readonly completed: boolean;
}

export type TransitionListener = (
  tx: TenantTransaction,
  context: WfContext,
  notice: TransitionNotice,
) => Promise<void>;

const listeners = new Map<string, TransitionListener>();

/** El módulo dueño de un tipo de registro se inscribe una vez, al arrancar. */
export function onWorkflowTransition(entityType: string, listener: TransitionListener): void {
  listeners.set(entityType, listener);
}

export async function notifyTransition(
  tx: TenantTransaction,
  context: WfContext,
  notice: TransitionNotice,
): Promise<void> {
  await listeners.get(notice.entityType)?.(tx, context, notice);
}
