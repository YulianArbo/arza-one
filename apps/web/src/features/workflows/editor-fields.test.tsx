import {
  taskSummarySchema,
  type HistoryEntry,
  type StateInput,
  type TransitionInput,
} from '@arza/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState, type JSX } from 'react';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { taskSummary } from '../../test-support/wf-fixtures';

import { draftOf, emptyTransition } from './editor-model';
import { StateEditor } from './state-editor';
import { responsibleOf } from './task-detail';
import { TransitionEditor } from './transition-editor';
import { WorkflowActions } from './workflow-actions';
import { WorkflowHistory } from './workflow-history';

// Campos del editor de flujos y componentes de acciones e historial, por separado.

const ROLES = [{ value: 'CALIDAD', label: 'Calidad' }];

function Editor(): JSX.Element {
  const [states, setStates] = useState<StateInput[]>([...draftOf(null).states]);
  const [transitions, setTransitions] = useState<TransitionInput[]>([emptyTransition(states)]);
  return (
    <>
      <StateEditor states={states} roles={ROLES} onChange={setStates} />
      <TransitionEditor transitions={transitions} states={states} onChange={setTransitions} />
      <output data-testid="modelo">{JSON.stringify({ states, transitions })}</output>
    </>
  );
}

// Sin validar: el editor admite borradores incompletos, como un estado de aprobación sin aprobadores.
const modelSchema = z.object({
  states: z.array(z.record(z.string(), z.unknown())),
  transitions: z.array(z.record(z.string(), z.unknown())),
});

function model(): z.infer<typeof modelSchema> {
  return modelSchema.parse(JSON.parse(screen.getByTestId('modelo').textContent));
}

describe('campos de los estados', () => {
  it('edita clave, nombre, plazo, prioridad y responsable', async () => {
    render(<Editor />);
    fireEvent.change(screen.getByLabelText('Clave', { selector: '#estado-0-clave' }), {
      target: { value: 'inicio' },
    });
    fireEvent.change(screen.getByLabelText('Nombre', { selector: '#estado-0-nombre' }), {
      target: { value: 'Inicio' },
    });
    fireEvent.change(
      screen.getByLabelText('Plazo (horas hábiles)', { selector: '#estado-0-plazo' }),
      { target: { value: '' } },
    );
    await userEvent.selectOptions(
      screen.getByLabelText('Prioridad', { selector: '#estado-0-prioridad' }),
      'urgent',
    );
    await userEvent.selectOptions(screen.getByLabelText('Quién lo atiende'), 'role:CALIDAD');
    expect(model().states[0]).toMatchObject({
      key: 'inicio',
      label: 'Inicio',
      sla_hours: null,
      priority: 'urgent',
      assignee: { type: 'role', role: 'CALIDAD' },
    });
  });
});

describe('estados nuevos y de aprobación', () => {
  it('agrega, cambia a aprobación en paralelo y quita estados', async () => {
    render(<Editor />);
    await userEvent.click(screen.getByRole('button', { name: 'Agregar un estado' }));
    await userEvent.selectOptions(
      screen.getByLabelText('Tipo', { selector: '#estado-2-tipo' }),
      'approval',
    );
    await userEvent.selectOptions(screen.getByLabelText('Cómo se aprueba'), 'parallel');
    await userEvent.selectOptions(screen.getByLabelText('Aprobador 1'), '');
    expect(model().states[2]).toMatchObject({
      kind: 'approval',
      approval: { mode: 'parallel', approvers: [] },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Quitar el estado «Paso 3»' }));
    expect(model().states).toHaveLength(2);
  });
});

describe('campos de las transiciones', () => {
  it('edita ruta, nombre, permiso, condición y comentario; agrega y quita', async () => {
    render(<Editor />);
    await userEvent.selectOptions(screen.getByLabelText('Hasta'), 'borrador');
    fireEvent.change(screen.getByLabelText('Clave de la acción'), { target: { value: 'enviar' } });
    fireEvent.change(screen.getByLabelText('Nombre del botón'), { target: { value: 'Enviar' } });
    await userEvent.selectOptions(screen.getByLabelText('Quién puede hacerla'), 'wf.task.reassign');
    fireEvent.change(screen.getByLabelText('Dato del registro'), { target: { value: 'amount' } });
    await userEvent.selectOptions(screen.getByLabelText('Comparación'), 'gt');
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '100' } });
    expect(model().transitions[0]).toMatchObject({
      to_state: 'borrador',
      action: 'enviar',
      label: 'Enviar',
      required_permission: 'wf.task.reassign',
      condition: [{ fact: 'amount', op: 'gt', value: 100 }],
    });
    await userEvent.selectOptions(screen.getByLabelText('Desde'), 'terminado');
    await userEvent.selectOptions(screen.getByLabelText('Quién puede hacerla'), '');
    expect(model().transitions[0]).toMatchObject({
      from_state: 'terminado',
      required_permission: null,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Agregar una transición' }));
    await userEvent.click(screen.getByRole('button', { name: 'Quitar la transición «Enviar»' }));
    expect(model().transitions.map((t) => t['label'])).toEqual(['Nueva acción']);
  });
});

describe('acciones, historial y responsable', () => {
  it('sin acciones lo dice; sin responsable lo dice', () => {
    render(
      <WorkflowActions actions={[]} pending={false} error={null} onAction={() => undefined} />,
    );
    expect(screen.getByText('Usted no tiene acciones en este paso.')).toBeInTheDocument();
    const nobody = taskSummarySchema.parse(taskSummary({ assignee: null, assignee_role: null }));
    expect(responsibleOf(nobody)).toBe('Sin responsable');
  });

  it('muestra un paso de un estado a otro hecho por el sistema, y un historial vacío', () => {
    const state = { key: 'a', label: 'Uno', kind: 'normal' } as const;
    const entry: HistoryEntry = {
      id: '01999a00-0000-7000-8000-0000000e0301',
      from_state: state,
      to_state: { key: 'b', label: 'Dos', kind: 'final' },
      action: 'finish',
      action_label: 'Terminar',
      actor: null,
      on_behalf_of: null,
      comment: null,
      occurred_at: '2026-10-15T14:00:00.000Z',
    };
    const { unmount } = render(<WorkflowHistory history={[entry]} />);
    expect(screen.getByText('De «Uno» a «Dos»')).toBeInTheDocument();
    expect(screen.getByText('El sistema')).toBeInTheDocument();
    unmount();
    render(<WorkflowHistory history={[]} />);
    expect(screen.getByText('Todavía no hay pasos registrados.')).toBeInTheDocument();
  });
});
