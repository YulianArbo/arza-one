import type { StateInput, TransitionInput } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import {
  approvalOutcome,
  findTransition,
  firstApprovers,
  initialState,
  offeredActions,
  stateOf,
  transitionProblem,
  type Flow,
  type TransitionRequest,
} from './engine.js';

// Motor de flujos (B15): las reglas que hacen imposible una transición no definida.

function state(key: string, kind: StateInput['kind'], approval: StateInput['approval'] = null) {
  const base = { key, label: key, kind, sla_hours: null, priority: 'normal' } as const;
  return { ...base, assignee: null, approval } satisfies StateInput;
}

function transition(
  from: string,
  to: string,
  action: string,
  extra: Partial<TransitionInput> = {},
) {
  return {
    from_state: from,
    to_state: to,
    action,
    label: action,
    required_permission: null,
    condition: null,
    requires_comment: false,
    ...extra,
  } satisfies TransitionInput;
}

const SERIAL = {
  mode: 'serial',
  approvers: [{ type: 'supervisor' }, { type: 'role', role: 'CALIDAD' }],
} satisfies StateInput['approval'];

const FLOW: Flow = {
  states: [
    state('draft', 'initial'),
    state('review', 'approval', SERIAL),
    state('done', 'final'),
    state('cancelled', 'final'),
  ],
  transitions: [
    transition('draft', 'review', 'submit', {
      condition: [{ fact: 'amount', op: 'lte', value: 5_000_000 }],
    }),
    transition('draft', 'cancelled', 'cancel', {
      required_permission: 'wf.task.reassign',
      requires_comment: true,
    }),
    transition('review', 'done', 'approve'),
    transition('review', 'draft', 'reject'),
  ],
};

const ASK: TransitionRequest = {
  action: 'submit',
  comment: null,
  facts: { amount: 1000 },
  hasPermission: () => false,
  attendsState: true,
  fromApprovals: false,
};

describe('transiciones del motor (ficha 17.5)', () => {
  it('permite una transición definida a quien atiende el estado', () => {
    expect(transitionProblem(FLOW, 'draft', ASK)).toBeNull();
  });

  it('una transición no definida es imposible', () => {
    expect(transitionProblem(FLOW, 'draft', { ...ASK, action: 'approve' })).toBe('not_defined');
    expect(transitionProblem(FLOW, 'done', { ...ASK, action: 'submit' })).toBe('not_defined');
    expect(findTransition(FLOW, 'draft', 'fly')).toBeNull();
  });

  it('aprobar o rechazar un estado de aprobación solo lo hace el motor con las decisiones', () => {
    expect(transitionProblem(FLOW, 'review', { ...ASK, action: 'approve' })).toBe('reserved');
    const fromApprovals = { ...ASK, action: 'approve', fromApprovals: true };
    expect(transitionProblem(FLOW, 'review', fromApprovals)).toBeNull();
    expect(transitionProblem(FLOW, 'draft', { ...ASK, fromApprovals: true })).toBe('reserved');
  });

  it('exige el permiso de la transición, o atender el estado si no tiene permiso', () => {
    const cancel = { ...ASK, action: 'cancel', comment: 'Ya no se necesita' };
    expect(transitionProblem(FLOW, 'draft', cancel)).toBe('permission');
    expect(transitionProblem(FLOW, 'draft', { ...cancel, hasPermission: () => true })).toBeNull();
    expect(transitionProblem(FLOW, 'draft', { ...ASK, attendsState: false })).toBe(
      'not_participant',
    );
  });

  it('exige la condición y el comentario', () => {
    expect(transitionProblem(FLOW, 'draft', { ...ASK, facts: { amount: '5000000.01' } })).toBe(
      'condition',
    );
    const noComment = { ...ASK, action: 'cancel', comment: '  ', hasPermission: () => true };
    expect(transitionProblem(FLOW, 'draft', noComment)).toBe('comment');
  });
});

describe('acciones ofrecidas y estados', () => {
  it('ofrece las acciones posibles, con la condición pendiente deshabilitada', () => {
    const request = {
      facts: { amount: 9_000_000 },
      hasPermission: () => false,
      attendsState: true,
    };
    const offered = offeredActions(FLOW, 'draft', request);
    expect(offered.map((o) => [o.transition.action, o.conditionMet])).toEqual([['submit', false]]);
    expect(offeredActions(FLOW, 'review', request)).toEqual([]);
  });

  it('encuentra los estados y el inicial, y falla con uno inexistente', () => {
    expect(initialState(FLOW).key).toBe('draft');
    expect(stateOf(FLOW, 'done').kind).toBe('final');
    expect(() => stateOf(FLOW, 'lost')).toThrow('El flujo no tiene el estado «lost».');
    expect(() => initialState({ ...FLOW, states: [] })).toThrow(
      'El flujo no tiene estado inicial.',
    );
  });
});

describe('aprobaciones en serie y en paralelo (ficha 17.5)', () => {
  const PARALLEL = { ...SERIAL, mode: 'parallel' } satisfies StateInput['approval'];

  it('en serie se crea la tarea del primero y luego la del siguiente', () => {
    expect(firstApprovers(SERIAL)).toEqual([0]);
    expect(approvalOutcome(SERIAL, [{ sequence: 0, decision: 'approved' }])).toEqual({
      kind: 'next',
      sequence: 1,
    });
  });

  it('en paralelo se crean todas y se espera a que aprueben todos', () => {
    expect(firstApprovers(PARALLEL)).toEqual([0, 1]);
    expect(approvalOutcome(PARALLEL, [{ sequence: 1, decision: 'approved' }])).toEqual({
      kind: 'wait',
    });
  });

  it('con todas aprobadas se aprueba; con un rechazo se rechaza', () => {
    const both = [
      { sequence: 0, decision: 'approved' },
      { sequence: 1, decision: 'approved' },
    ] as const;
    expect(approvalOutcome(PARALLEL, both)).toEqual({ kind: 'approve' });
    expect(approvalOutcome(SERIAL, both)).toEqual({ kind: 'approve' });
    expect(approvalOutcome(PARALLEL, [{ sequence: 0, decision: 'rejected' }])).toEqual({
      kind: 'reject',
    });
  });
});
