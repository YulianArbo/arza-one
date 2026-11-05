import { describe, expect, it } from 'vitest';

import { START_ACTIONS, START_FLOW_DATA, START_STATES } from './project-flows.js';

// El flujo de autorización para iniciar sin contrato vigente (B26, ficha 17.8).

describe('autorización para iniciar un proyecto', () => {
  it('la decide la Dirección, con el permiso con que aprueba los contratos', () => {
    const [decision] = START_FLOW_DATA.states;
    expect(decision).toMatchObject({
      key: START_STATES.decision,
      kind: 'initial',
      assignee: { type: 'role', role: 'DIRECCION' },
    });
    expect(START_FLOW_DATA.transitions.map((step) => step.required_permission)).toEqual([
      'contract.approve',
      'contract.approve',
    ]);
  });

  it('no autorizar exige un comentario; autorizar, no', () => {
    const byAction = new Map(START_FLOW_DATA.transitions.map((step) => [step.action, step]));
    expect(byAction.get(START_ACTIONS.authorize)?.requires_comment).toBe(false);
    expect(byAction.get(START_ACTIONS.deny)?.requires_comment).toBe(true);
  });
});
