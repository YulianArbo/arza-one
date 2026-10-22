'use client';

import { DialogFooter, SelectField, TextareaField } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useCatalog } from '../organization/queries';
import { useCrmAction } from './crm-action';

// Motivo de una decisión del CRM (B22): descartar un prospecto o perder una oportunidad. El
// motivo sale de su catálogo (Administración › Catálogos) y el detalle es opcional.

export interface Reason {
  readonly reason: string;
  readonly note: string | null;
}

interface ReasonFormProps {
  /** Catálogo de los motivos, como «crm_lost_reasons». */
  readonly catalog: string;
  readonly idPrefix: string;
  readonly label: string;
  readonly missing: string;
  readonly submitLabel: string;
  readonly run: (reason: Reason, csrfToken: string) => Promise<void>;
  readonly onDone: () => void;
}

function useReasonOptions(catalog: string): { value: string; label: string }[] {
  const items = useCatalog(catalog).data?.items ?? [];
  return [
    { value: '', label: 'Elija el motivo' },
    ...items
      .filter((item) => item.is_active)
      .map((item) => ({ value: item.code, label: item.label })),
  ];
}

function useReasonForm(props: ReasonFormProps) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const action = useCrmAction<Reason>(props.run, props.onDone);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setProblem(reason === '' ? props.missing : undefined);
    if (reason !== '') action.execute({ reason, note: note.trim() === '' ? null : note.trim() });
  };
  return { reason, setReason, note, setNote, problem, action, submit };
}

export function ReasonForm(props: ReasonFormProps): JSX.Element {
  const options = useReasonOptions(props.catalog);
  const { reason, setReason, note, setNote, problem, action, submit } = useReasonForm(props);
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {action.error === null ? null : <FormError error={action.error} />}
      <SelectField
        id={`${props.idPrefix}-motivo`}
        label={props.label}
        options={options}
        value={reason}
        error={problem}
        onChange={(event) => {
          setReason(event.target.value);
        }}
      />
      <TextareaField
        id={`${props.idPrefix}-nota`}
        label="Detalle (opcional)"
        value={note}
        maxLength={2000}
        onChange={(event) => {
          setNote(event.target.value);
        }}
      />
      <DialogFooter>
        <SubmitButton
          label={props.submitLabel}
          pendingLabel="Guardando…"
          pending={action.pending}
        />
      </DialogFooter>
      {action.dialog}
    </form>
  );
}
