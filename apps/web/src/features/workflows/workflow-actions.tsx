'use client';

import type { AvailableAction } from '@arza/contracts';
import { Button, Label, Textarea } from '@arza/ui';
import { useState, type JSX } from 'react';

import { FormError } from '../access/form-alert';

// Componente «Acciones del trámite» (B15): un botón por cada transición que la persona puede hacer
// en el estado actual. Las que aún no cumplen su condición aparecen deshabilitadas, con el porqué.
// Quien lo usa decide a qué ruta enviar la acción (completar una tarea o mover un trámite).

interface WorkflowActionsProps {
  readonly actions: readonly AvailableAction[];
  readonly pending: boolean;
  readonly error: unknown;
  readonly onAction: (action: string, comment: string) => void;
  /** Identificador para los campos, por si hay dos en la misma pantalla. */
  readonly idPrefix?: string;
}

export function CommentField(props: {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Textarea
        id={props.id}
        aria-describedby={`${props.id}-ayuda`}
        rows={3}
        maxLength={2000}
        value={props.value}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
      />
      <p id={`${props.id}-ayuda`} className="text-xs text-muted-foreground">
        {props.hint}
      </p>
    </div>
  );
}

function blockedReason(action: AvailableAction, comment: string): string | null {
  if (!action.condition_met) return 'El registro todavía no cumple la condición de esta acción.';
  if (action.requires_comment && comment.trim() === '') return 'Escriba un comentario primero.';
  return null;
}

function ActionButton(props: {
  readonly action: AvailableAction;
  readonly comment: string;
  readonly pending: boolean;
  readonly onAction: (action: string) => void;
}): JSX.Element {
  const reason = blockedReason(props.action, props.comment);
  const hintId = `accion-${props.action.action}-motivo`;
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={props.pending || reason !== null}
        aria-describedby={reason === null ? undefined : hintId}
        onClick={() => {
          props.onAction(props.action.action);
        }}
      >
        {props.action.label} → {props.action.to_state.label}
      </Button>
      {reason === null ? null : (
        <p id={hintId} className="text-xs text-muted-foreground">
          {reason}
        </p>
      )}
    </div>
  );
}

export function WorkflowActions(props: WorkflowActionsProps): JSX.Element {
  const [comment, setComment] = useState('');
  if (props.actions.length === 0) {
    return <p className="text-sm text-muted-foreground">Usted no tiene acciones en este paso.</p>;
  }
  const needsComment = props.actions.some((action) => action.requires_comment);
  return (
    <div className="flex flex-col gap-3">
      <CommentField
        id={`${props.idPrefix ?? 'tramite'}-comentario`}
        label="Comentario"
        hint={needsComment ? 'Algunas acciones lo exigen.' : 'Opcional: queda en el historial.'}
        value={comment}
        onChange={setComment}
      />
      {props.error === null ? null : <FormError error={props.error} />}
      <div className="flex flex-wrap gap-3">
        {props.actions.map((action) => (
          <ActionButton
            key={action.action}
            action={action}
            comment={comment}
            pending={props.pending}
            onAction={(name) => {
              props.onAction(name, comment.trim());
            }}
          />
        ))}
      </div>
    </div>
  );
}
