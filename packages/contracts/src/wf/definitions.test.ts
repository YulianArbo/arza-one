import { describe, expect, it } from 'vitest';

import {
  createDefinitionRequestSchema,
  definitionProblems,
  type StateInput,
  type TransitionInput,
} from '../index.js';

function state(key: string, kind: StateInput['kind'], extra: Partial<StateInput> = {}) {
  return {
    key,
    label: key,
    kind,
    sla_hours: null,
    priority: 'normal',
    assignee: null,
    approval: null,
    ...extra,
  } satisfies StateInput;
}

function transition(from: string, to: string, action: string): TransitionInput {
  return {
    from_state: from,
    to_state: to,
    action,
    label: action,
    required_permission: null,
    condition: null,
    requires_comment: false,
  };
}

const approval: StateInput['approval'] = { mode: 'serial', approvers: [{ type: 'supervisor' }] };

const VALID = {
  states: [
    state('draft', 'initial', { assignee: { type: 'initiator' } }),
    state('review', 'approval', { approval, sla_hours: 16 }),
    state('approved', 'final'),
    state('rejected', 'final'),
  ],
  transitions: [
    transition('draft', 'review', 'submit'),
    transition('review', 'approved', 'approve'),
    transition('review', 'rejected', 'reject'),
  ],
};

describe('definición de un flujo (ficha 17.5)', () => {
  it('una definición completa no tiene problemas', () => {
    expect(definitionProblems(VALID)).toEqual([]);
  });

  it('exige un solo estado inicial y al menos uno final', () => {
    const states = VALID.states.map((s) => ({ ...s, kind: 'normal' as const }));
    expect(definitionProblems({ ...VALID, states })).toEqual(
      expect.arrayContaining([
        'El flujo debe tener exactamente un estado inicial.',
        'El flujo debe tener al menos un estado final.',
      ]),
    );
  });

  it('rechaza estados repetidos, sin salida o a los que no se llega', () => {
    const repeated = { ...VALID, states: [...VALID.states, state('draft', 'final')] };
    expect(definitionProblems(repeated)).toEqual(['Hay dos estados con la misma clave.']);
    const orphan = { ...VALID, states: [...VALID.states, state('lost', 'normal')] };
    expect(definitionProblems(orphan)).toEqual([
      'No se llega al estado «lost».',
      'El estado «lost» no tiene salida.',
    ]);
  });

  it('una aprobación necesita aprobadores y las transiciones approve y reject', () => {
    const states = VALID.states.map((s) => (s.key === 'review' ? { ...s, approval: null } : s));
    const transitions = VALID.transitions.filter((t) => t.action !== 'reject');
    expect(definitionProblems({ states, transitions })).toEqual(
      expect.arrayContaining([
        'El estado «review» es de aprobación y no dice quién aprueba.',
        'El estado «review» necesita las transiciones «approve» y «reject».',
      ]),
    );
  });
});

describe('transiciones, plazos y condiciones de un flujo', () => {
  it('rechaza transiciones desde un final, a estados inexistentes o con acción repetida', () => {
    const transitions = [
      ...VALID.transitions,
      transition('approved', 'draft', 'reopen'),
      transition('draft', 'nowhere', 'jump'),
      transition('draft', 'rejected', 'submit'),
    ];
    expect(definitionProblems({ ...VALID, transitions })).toEqual(
      expect.arrayContaining([
        'La transición «reopen» sale de un estado final.',
        'La transición «jump» usa un estado que no existe.',
        'Un mismo estado tiene dos transiciones con la misma acción.',
      ]),
    );
  });

  it('un estado final no tiene plazo ni responsable', () => {
    const states = VALID.states.map((s) =>
      s.key === 'approved' ? { ...s, sla_hours: 8, assignee: { type: 'initiator' as const } } : s,
    );
    expect(definitionProblems({ ...VALID, states })).toEqual([
      'Solo los estados normales tienen responsable («approved»).',
      'Un estado final no tiene plazo («approved»).',
    ]);
  });
});

describe('esquema de una definición', () => {
  it('las condiciones son comparaciones con datos y los permisos son del catálogo', () => {
    const submit = (changes: object) => ({
      key: 'demo.request',
      entity_type: 'demo.request',
      name: 'Demo',
      description: null,
      states: VALID.states,
      transitions: [
        { ...transition('draft', 'review', 'submit'), ...changes },
        ...VALID.transitions.slice(1),
      ],
    });
    const amount = [{ fact: 'amount', op: 'gt', value: 5_000_000 }];
    const valid = submit({ condition: amount, required_permission: 'wf.task.work' });
    expect(createDefinitionRequestSchema.safeParse(valid).success).toBe(true);
    const unknownPermission = submit({ required_permission: 'wf.task.fly' });
    expect(createDefinitionRequestSchema.safeParse(unknownPermission).success).toBe(false);
    const code = submit({ condition: [{ fact: 'amount', op: 'eval', value: 'process.exit()' }] });
    expect(createDefinitionRequestSchema.safeParse(code).success).toBe(false);
  });
});
