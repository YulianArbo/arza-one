'use client';

import type { ContractDetail } from '@arza/contracts';
import { Badge, Checkbox, DialogFooter, FormField, Label, TextareaField } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { FormSummary } from '../../components/form-summary';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import type { AdminAction } from '../administration/admin-action';

// Formularios de las decisiones sobre un contrato (B24): aprobar revisando una por una las cláusulas
// modificadas, y los de texto con fecha opcional (devolver, prorrogar, terminar, obligaciones).

/** Un campo de texto y, si se pide, una fecha: lo que llevan devolver, prorrogar y terminar. */
export interface NoteFormSpec {
  readonly idPrefix: string;
  readonly textField: string;
  readonly textLabel: string;
  readonly dateField?: string;
  readonly dateLabel?: string;
  readonly submitLabel: string;
  readonly pendingLabel: string;
}

/** Lo que falta en el formulario de texto y fecha; vacío si está listo. */
export function noteProblems(
  spec: NoteFormSpec,
  text: string,
  date: string,
): Record<string, string> {
  const found: Record<string, string> = {};
  if (text.trim().length < 3) found[spec.textField] = 'Escriba al menos tres letras.';
  if (spec.dateField !== undefined && date === '') found[spec.dateField] = 'Elija la fecha.';
  return found;
}

function useNoteForm(spec: NoteFormSpec, action: AdminAction<object, unknown>) {
  const [text, setText] = useState('');
  const [date, setDate] = useState('');
  const [problems, setProblems] = useState<Record<string, string>>({});
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = noteProblems(spec, text, date);
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    const body: Record<string, string> = { [spec.textField]: text.trim() };
    if (spec.dateField !== undefined) body[spec.dateField] = date;
    action.execute(body);
  };
  return { text, setText, date, setDate, problems, submit };
}

function summaryFields(spec: NoteFormSpec) {
  const text = { field: spec.textField, id: `${spec.idPrefix}-texto`, label: spec.textLabel };
  if (spec.dateField === undefined) return [text];
  return [
    { field: spec.dateField, id: `${spec.idPrefix}-fecha`, label: spec.dateLabel ?? '' },
    text,
  ];
}

function DateInput(props: {
  readonly spec: NoteFormSpec;
  readonly form: ReturnType<typeof useNoteForm>;
}): JSX.Element | null {
  const { spec, form } = props;
  if (spec.dateField === undefined) return null;
  return (
    <FormField
      id={`${spec.idPrefix}-fecha`}
      label={spec.dateLabel ?? ''}
      type="date"
      value={form.date}
      error={form.problems[spec.dateField] ?? null}
      onChange={(event) => {
        form.setDate(event.target.value);
      }}
    />
  );
}

export function NoteForm(props: {
  readonly spec: NoteFormSpec;
  readonly action: AdminAction<object, unknown>;
}): JSX.Element {
  const { spec, action } = props;
  const form = useNoteForm(spec, action);
  return (
    <form noValidate onSubmit={form.submit} className="flex flex-col gap-4">
      {action.error === null ? null : <FormError error={action.error} />}
      <FormSummary problems={form.problems} fields={summaryFields(spec)} />
      <DateInput spec={spec} form={form} />
      <TextareaField
        id={`${spec.idPrefix}-texto`}
        label={spec.textLabel}
        rows={3}
        value={form.text}
        error={form.problems[spec.textField] ?? null}
        onChange={(event) => {
          form.setText(event.target.value);
        }}
      />
      <DialogFooter>
        <SubmitButton
          label={spec.submitLabel}
          pendingLabel={spec.pendingLabel}
          pending={action.pending}
        />
      </DialogFooter>
      {action.dialog}
    </form>
  );
}

type ReviewedClause = ContractDetail['clauses'][number];

function ReviewItem(props: {
  readonly clause: ReviewedClause;
  readonly checked: boolean;
  readonly toggle: () => void;
}): JSX.Element {
  const { clause } = props;
  const id = `revisar-${clause.id}`;
  return (
    <li className="flex items-start gap-2 rounded-xl border p-3">
      <Checkbox id={id} checked={props.checked} onChange={props.toggle} className="mt-1" />
      <Label htmlFor={id} className="flex flex-col gap-1 font-normal">
        <span className="font-medium">
          {clause.ordinal === null ? '' : `${clause.ordinal}. `}
          {clause.title}{' '}
          <Badge tone="warning">{clause.origin === 'added' ? 'Nueva' : 'Modificada'}</Badge>
        </span>
        <span className="text-sm">Revisé este texto y lo apruebo.</span>
      </Label>
    </li>
  );
}

function useApproval(contract: ContractDetail, action: AdminAction<object, unknown>) {
  const pending = contract.clauses.filter((clause) => clause.origin !== 'library');
  const [reviewed, setReviewed] = useState<ReadonlySet<string>>(new Set());
  const [legalNote, setLegalNote] = useState('');
  const toggle = (id: string): void => {
    const next = new Set(reviewed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setReviewed(next);
  };
  const complete = reviewed.size === pending.length;
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!complete) return;
    const note = legalNote.trim();
    const legal = note.length >= 3 ? note : null;
    action.execute({ comment: null, reviewed_clause_ids: [...reviewed], legal_note: legal });
  };
  return { pending, reviewed, toggle, legalNote, setLegalNote, complete, submit };
}

function ReviewList(props: { readonly approval: ReturnType<typeof useApproval> }): JSX.Element {
  const { approval } = props;
  if (approval.pending.length === 0) {
    return <p className="text-sm">Todas las cláusulas son de la biblioteca, sin cambios.</p>;
  }
  return (
    <ul aria-label="Cláusulas por revisar" className="flex flex-col gap-2">
      {approval.pending.map((clause) => (
        <ReviewItem
          key={clause.id}
          clause={clause}
          checked={approval.reviewed.has(clause.id)}
          toggle={() => {
            approval.toggle(clause.id);
          }}
        />
      ))}
    </ul>
  );
}

/** Aprobar: la Dirección marca como revisada cada cláusula modificada o nueva (ficha 17.7). */
export function ApproveForm(props: {
  readonly contract: ContractDetail;
  readonly action: AdminAction<object, unknown>;
}): JSX.Element {
  const approval = useApproval(props.contract, props.action);
  return (
    <form noValidate onSubmit={approval.submit} className="flex flex-col gap-4">
      {props.action.error === null ? null : <FormError error={props.action.error} />}
      <ReviewList approval={approval} />
      <TextareaField
        id="aprobar-concepto"
        label="Concepto jurídico (opcional)"
        rows={2}
        value={approval.legalNote}
        onChange={(event) => {
          approval.setLegalNote(event.target.value);
        }}
      />
      {approval.complete ? null : (
        <p className="text-sm text-muted-foreground">
          Marque cada cláusula modificada o nueva para poder aprobar.
        </p>
      )}
      <DialogFooter>
        <SubmitButton label="Aprobar" pendingLabel="Aprobando…" pending={props.action.pending} />
      </DialogFooter>
      {props.action.dialog}
    </form>
  );
}
