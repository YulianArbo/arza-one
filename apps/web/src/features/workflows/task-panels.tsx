'use client';

import type { TaskView } from '@arza/contracts';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@arza/ui';
import { useState, type JSX, type ReactNode, type SubmitEvent } from 'react';

import { FormError } from '../access/form-alert';
import { FormField } from '../access/form-field';
import { usePermissions } from '../session/permissions';
import { useTaskAction, withComment } from './mutations';
import { CommentField, WorkflowActions } from './workflow-actions';

// Paneles de acción de una tarea: tomarla, completarla, aprobar o rechazar, delegar y reasignar.

/** Tomar una tarea pendiente: pasa a «en curso» y, si era de un rol, queda a su nombre. */
export function StartPanel({ task }: { readonly task: TaskView }): JSX.Element | null {
  const start = useTaskAction(task.id);
  if (!task.can_act || task.status !== 'pending') return null;
  return (
    <div className="flex flex-col gap-2">
      {start.error === null ? null : <FormError error={start.error} />}
      <Button
        type="button"
        disabled={start.pending}
        onClick={() => {
          start.execute({ action: 'start', body: {} });
        }}
      >
        {task.reason === 'role' ? 'Tomar la tarea' : 'Empezar'}
      </Button>
      {start.dialog}
    </div>
  );
}

/** Completar una tarea de acción con una de las transiciones del paso. */
export function CompletePanel({ task }: { readonly task: TaskView }): JSX.Element {
  const complete = useTaskAction(task.id);
  return (
    <>
      <WorkflowActions
        idPrefix="tarea"
        actions={task.actions}
        pending={complete.pending}
        error={complete.error}
        onAction={(action, comment) => {
          complete.execute({ action: 'complete', body: withComment({ action }, comment) });
        }}
      />
      {complete.dialog}
    </>
  );
}

/** Aprobar o rechazar; rechazar exige el motivo. */
export function DecisionPanel({ task }: { readonly task: TaskView }): JSX.Element {
  const [comment, setComment] = useState('');
  const decide = useTaskAction(task.id);
  const reason = comment.trim();
  return (
    <div className="flex flex-col gap-3">
      <CommentField
        id="decision-comentario"
        label="Comentario"
        hint="Obligatorio si rechaza: explique el motivo."
        value={comment}
        onChange={setComment}
      />
      {decide.error === null ? null : <FormError error={decide.error} />}
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={decide.pending}
          onClick={() => {
            decide.execute({ action: 'approve', body: withComment({}, reason) });
          }}
        >
          Aprobar
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={decide.pending || reason === ''}
          onClick={() => {
            decide.execute({ action: 'reject', body: { comment: reason } });
          }}
        >
          Rechazar
        </Button>
      </div>
      {decide.dialog}
    </div>
  );
}

function HandOverCard(props: {
  readonly title: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
      </CardHeader>
      <CardContent>{props.children}</CardContent>
    </Card>
  );
}

function HandOverForm(props: {
  readonly task: TaskView;
  readonly action: 'delegate' | 'reassign';
  readonly title: string;
  readonly hint: string;
}): JSX.Element {
  const [email, setEmail] = useState('');
  const handOver = useTaskAction(props.task.id);
  const id = `${props.action}-correo`;
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    handOver.execute({ action: props.action, body: { to_email: email.trim() } });
  };
  return (
    <HandOverCard title={props.title}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <FormField
          id={id}
          label="Correo de quien la recibe"
          type="email"
          hint={props.hint}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
        />
        {handOver.error === null ? null : <FormError error={handOver.error} />}
        <Button type="submit" variant="outline" disabled={handOver.pending || email.trim() === ''}>
          {props.action === 'delegate' ? 'Delegar' : 'Reasignar'}
        </Button>
      </form>
      {handOver.dialog}
    </HandOverCard>
  );
}

/** Delegar (la persona responsable) y reasignar (quien reasigna tareas). */
export function HandOverPanels({ task }: { readonly task: TaskView }): JSX.Element | null {
  const permissions = usePermissions();
  const open = task.status !== 'completed' && task.status !== 'cancelled';
  const canDelegate = open && (task.reason === 'assigned' || task.reason === 'role');
  const canReassign = open && permissions.canAll('wf.task.reassign');
  if (!canDelegate && !canReassign) return null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {canDelegate ? (
        <HandOverForm
          task={task}
          action="delegate"
          title="Delegar la tarea"
          hint="El plazo sigue igual."
        />
      ) : null}
      {canReassign ? (
        <HandOverForm
          task={task}
          action="reassign"
          title="Reasignar la tarea"
          hint="La persona recibe un plazo nuevo desde ahora."
        />
      ) : null}
    </div>
  );
}
