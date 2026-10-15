import {
  APPROVAL_ACTIONS,
  type PermissionCode,
  type StateInput,
  type TransitionInput,
  type WorkflowFacts,
} from '@arza/contracts';

import { conditionHolds } from './conditions.js';

// Motor de flujos (numeral 13.2, ADR-011): lee la definición con la que inició el trámite y decide
// si una transición es posible. Una transición que no está en la definición es imposible, también
// por la API (ficha 17.5).

/** Una versión de un flujo, como la guardó el editor. */
export interface Flow {
  readonly states: readonly StateInput[];
  readonly transitions: readonly TransitionInput[];
}

/** Lo que se sabe de quien pide la transición. */
export interface TransitionRequest {
  readonly action: string;
  readonly comment: string | null;
  readonly facts: WorkflowFacts;
  readonly hasPermission: (code: PermissionCode) => boolean;
  /** Puede atender el estado actual: tiene una de sus tareas abiertas o, sin tareas, lo inició. */
  readonly attendsState: boolean;
  /** La pide el motor al completar las aprobaciones de un estado de aprobación. */
  readonly fromApprovals: boolean;
}

export type TransitionProblem =
  'not_defined' | 'reserved' | 'permission' | 'not_participant' | 'condition' | 'comment';

export function stateOf(flow: Flow, key: string): StateInput {
  const state = flow.states.find((candidate) => candidate.key === key);
  if (state === undefined) throw new Error(`El flujo no tiene el estado «${key}».`);
  return state;
}

export function initialState(flow: Flow): StateInput {
  const state = flow.states.find((candidate) => candidate.kind === 'initial');
  if (state === undefined) throw new Error('El flujo no tiene estado inicial.');
  return state;
}

export function findTransition(flow: Flow, from: string, action: string): TransitionInput | null {
  return flow.transitions.find((t) => t.from_state === from && t.action === action) ?? null;
}

function isReserved(state: StateInput, action: string): boolean {
  const reserved: readonly string[] = Object.values(APPROVAL_ACTIONS);
  return state.kind === 'approval' && reserved.includes(action);
}

/** Quién puede hacerla: con permiso, quien lo tenga; sin él, quien atiende el estado. */
function actorProblem(transition: TransitionInput, request: TransitionRequest) {
  if (request.fromApprovals) return null;
  if (transition.required_permission !== null) {
    return request.hasPermission(transition.required_permission) ? null : 'permission';
  }
  return request.attendsState ? null : 'not_participant';
}

/** Por qué no se puede hacer la transición desde `from`, o null si se puede. */
export function transitionProblem(
  flow: Flow,
  from: string,
  request: TransitionRequest,
): TransitionProblem | null {
  const transition = findTransition(flow, from, request.action);
  if (transition === null) return 'not_defined';
  if (isReserved(stateOf(flow, from), request.action) !== request.fromApprovals) return 'reserved';
  const actor = actorProblem(transition, request);
  if (actor !== null) return actor;
  if (!conditionHolds(transition.condition, request.facts)) return 'condition';
  if (transition.requires_comment && (request.comment ?? '').trim() === '') return 'comment';
  return null;
}

export interface OfferedAction {
  readonly transition: TransitionInput;
  readonly conditionMet: boolean;
}

/**
 * Transiciones que la persona puede pedir desde `from`, para los botones de la pantalla. Las que
 * aún no cumplen su condición se ofrecen deshabilitadas, para que la persona sepa que existen.
 */
export function offeredActions(
  flow: Flow,
  from: string,
  request: Omit<TransitionRequest, 'action' | 'comment' | 'fromApprovals'>,
): OfferedAction[] {
  const state = stateOf(flow, from);
  return flow.transitions
    .filter((transition) => transition.from_state === from)
    .filter((transition) => !isReserved(state, transition.action))
    .filter((transition) => {
      const asked = { ...request, action: transition.action, comment: null, fromApprovals: false };
      return actorProblem(transition, asked) === null;
    })
    .map((transition) => ({
      transition,
      conditionMet: conditionHolds(transition.condition, request.facts),
    }));
}

/** Decisión de una aprobación ya registrada, con su lugar en la lista de aprobadores. */
export interface Decision {
  readonly sequence: number;
  readonly decision: 'approved' | 'rejected';
}

export type ApprovalOutcome =
  | { readonly kind: 'next'; readonly sequence: number }
  | { readonly kind: 'wait' }
  | { readonly kind: 'approve' }
  | { readonly kind: 'reject' };

/**
 * Qué sigue después de una decisión (ficha 17.5): un rechazo rechaza; en serie, aprobado pasa al
 * siguiente aprobador; en paralelo, se espera a que aprueben todos.
 */
export function approvalOutcome(
  approval: NonNullable<StateInput['approval']>,
  decisions: readonly Decision[],
): ApprovalOutcome {
  if (decisions.some((decision) => decision.decision === 'rejected')) return { kind: 'reject' };
  const approved = new Set(decisions.map((decision) => decision.sequence));
  const total = approval.approvers.length;
  if (approved.size >= total) return { kind: 'approve' };
  if (approval.mode === 'parallel') return { kind: 'wait' };
  return { kind: 'next', sequence: approved.size };
}

/** Aprobadores a los que se crea tarea al entrar al estado: el primero o todos a la vez. */
export function firstApprovers(approval: NonNullable<StateInput['approval']>): number[] {
  return approval.mode === 'serial' ? [0] : approval.approvers.map((_, index) => index);
}
