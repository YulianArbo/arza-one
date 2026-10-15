import { definitionProblems } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import {
  choiceOf,
  conditionFieldsOf,
  conditionOf,
  createRequestOf,
  draftOf,
  emptyState,
  emptyTransition,
  participantOf,
  removeAt,
  replaceAt,
  withKind,
} from './editor-model';

describe('modelo del editor de flujos', () => {
  it('convierte quién atiende en un valor de lista y de vuelta', () => {
    for (const participant of [
      { type: 'initiator' },
      { type: 'supervisor' },
      { type: 'role', role: 'CALIDAD' },
    ] as const) {
      expect(participantOf(choiceOf(participant))).toEqual(participant);
    }
    expect(choiceOf(null)).toBe('');
    expect(participantOf('')).toBeNull();
  });

  it('cambiar el tipo de un estado ajusta lo que admite', () => {
    const state = emptyState(0);
    expect(withKind(state, 'approval')).toMatchObject({
      assignee: null,
      approval: { mode: 'serial', approvers: [{ type: 'supervisor' }] },
    });
    expect(withKind(state, 'final')).toMatchObject({
      sla_hours: null,
      assignee: null,
      approval: null,
    });
    expect(withKind(withKind(state, 'approval'), 'normal')).toMatchObject({
      approval: null,
      assignee: { type: 'initiator' },
    });
  });
});

describe('condiciones del editor', () => {
  it('una condición vacía no es condición; los números se guardan como números', () => {
    expect(conditionOf({ fact: ' ', op: 'eq', value: '1' })).toBeNull();
    expect(conditionOf({ fact: 'amount', op: 'gt', value: '5000000' })).toEqual([
      { fact: 'amount', op: 'gt', value: 5_000_000 },
    ]);
    expect(conditionOf({ fact: 'tipo', op: 'eq', value: 'compra' })).toEqual([
      { fact: 'tipo', op: 'eq', value: 'compra' },
    ]);
    expect(conditionFieldsOf([{ fact: 'amount', op: 'lte', value: 10 }])).toEqual({
      fact: 'amount',
      op: 'lte',
      value: '10',
    });
    expect(conditionFieldsOf([{ fact: 'tipo', op: 'in', value: ['a'] }])).toEqual({
      fact: '',
      op: 'eq',
      value: '',
    });
  });
});

describe('flujo nuevo en el editor', () => {
  it('un flujo nuevo empieza con un estado inicial y uno final, y pide su transición', () => {
    const draft = draftOf(null);
    expect(draft.states.map((state) => state.kind)).toEqual(['initial', 'final']);
    expect(definitionProblems(draft)).toContain('El estado «Borrador» no tiene salida.');
    const ready = {
      ...draft,
      key: 'compras.solicitud',
      transitions: [emptyTransition(draft.states)],
    };
    expect(definitionProblems(ready)).toEqual([]);
    expect(createRequestOf({ ...ready, name: ' Compras ' })).toMatchObject({
      key: 'compras.solicitud',
      entity_type: 'compras.solicitud',
      name: 'Compras',
      description: null,
    });
  });

  it('reemplaza y quita elementos sin cambiar la lista original', () => {
    const list = ['a', 'b', 'c'];
    expect(replaceAt(list, 1, 'x')).toEqual(['a', 'x', 'c']);
    expect(removeAt(list, 0)).toEqual(['b', 'c']);
    expect(list).toEqual(['a', 'b', 'c']);
  });
});
