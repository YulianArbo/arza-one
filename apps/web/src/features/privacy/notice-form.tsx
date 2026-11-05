'use client';

import {
  createNoticeRequestSchema,
  isAuthorizationNotice,
  type EditableNoticeKey,
  type Notice,
} from '@arza/contracts';
import { Label, Textarea } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { FormSummary } from '../../components/form-summary';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useCatalog } from '../organization/queries';
import { CheckboxField, TextInput } from '../organization/record-dialog';
import { useSaveNotice } from './queries';

// Formulario de un borrador de texto de privacidad (B17): título, texto completo y, en las
// autorizaciones, las finalidades que el titular puede aceptar.

interface Draft {
  readonly title: string;
  readonly body: string;
  readonly purposes: readonly string[];
}

const MESSAGES: Readonly<Record<string, string>> = {
  title: 'Escriba un título de 3 a 200 caracteres.',
  body: 'El texto debe tener al menos 50 caracteres.',
};

function problemsOf(key: EditableNoticeKey, draft: Draft): Record<string, string> {
  const result = createNoticeRequestSchema.safeParse({ key, ...draft });
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '');
    errors[field] ??=
      issue.code === 'custom' ? issue.message : (MESSAGES[field] ?? 'Revise este dato.');
  }
  return errors;
}

function BodyField(props: {
  readonly value: string;
  readonly error: string | undefined;
  readonly onChange: (value: string) => void;
}): JSX.Element {
  const errorId = props.error === undefined ? undefined : 'aviso-texto-error';
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="aviso-texto">Texto completo</Label>
      <Textarea
        id="aviso-texto"
        rows={10}
        maxLength={20000}
        value={props.value}
        aria-invalid={props.error === undefined ? undefined : true}
        aria-describedby={errorId}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
      />
      {props.error === undefined ? null : (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {props.error}
        </p>
      )}
    </div>
  );
}

function PurposeOptions(props: {
  readonly draft: Draft;
  readonly error: string | undefined;
  readonly onChange: (draft: Draft) => void;
}): JSX.Element {
  const items = (useCatalog('personal_data_purposes').data?.items ?? []).filter(
    (item) => item.is_active,
  );
  const { draft, onChange } = props;
  return (
    <fieldset id="aviso-finalidades" className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Finalidades que ofrece</legend>
      {items.map((item) => (
        <CheckboxField
          key={item.code}
          id={`aviso-finalidad-${item.code}`}
          label={item.label}
          checked={draft.purposes.includes(item.code)}
          onChange={(checked) => {
            const purposes = checked
              ? [...draft.purposes, item.code]
              : draft.purposes.filter((code) => code !== item.code);
            onChange({ ...draft, purposes });
          }}
        />
      ))}
      {props.error === undefined ? null : (
        <p role="alert" className="text-xs font-medium text-destructive">
          {props.error}
        </p>
      )}
    </fieldset>
  );
}

interface NoticeFormProps {
  readonly noticeKey: EditableNoticeKey;
  /** El borrador que se edita, o null para crear la versión nueva a partir del texto vigente. */
  readonly draft: Notice | null;
  readonly base: Notice | null;
  readonly onSaved: () => void;
}

/** Valores, problemas y guardado del borrador; uno nuevo parte del texto vigente. */
function useNoticeForm({ noticeKey, draft, base, onSaved }: NoticeFormProps) {
  const source = draft ?? base;
  const [values, setValues] = useState<Draft>({
    title: source?.title ?? '',
    body: source?.body ?? '',
    purposes: source?.purposes ?? [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSaveNotice(onSaved);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = problemsOf(noticeKey, values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const body = { ...values, purposes: [...values.purposes] };
    save.execute(
      draft === null
        ? { id: null, body: { key: noticeKey, ...body } }
        : { id: draft.id, version: draft.version, body },
    );
  };
  return { values, setValues, errors, save, submit };
}

const SUMMARY_FIELDS = [
  { field: 'title', id: 'aviso-titulo', label: 'Título' },
  { field: 'body', id: 'aviso-texto', label: 'Texto completo' },
  { field: 'purposes', id: 'aviso-finalidades', label: 'Finalidades que ofrece' },
];

export function NoticeForm(props: NoticeFormProps): JSX.Element {
  const { values, setValues, errors, save, submit } = useNoticeForm(props);
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {save.error === null ? null : <FormError error={save.error} />}
      <FormSummary problems={errors} fields={SUMMARY_FIELDS} />
      <TextInput
        id="aviso-titulo"
        label="Título"
        value={values.title}
        maxLength={200}
        error={errors['title'] ?? null}
        onValue={(title) => {
          setValues({ ...values, title });
        }}
      />
      <BodyField
        value={values.body}
        error={errors['body']}
        onChange={(body) => {
          setValues({ ...values, body });
        }}
      />
      {isAuthorizationNotice(props.noticeKey) ? (
        <PurposeOptions draft={values} error={errors['purposes']} onChange={setValues} />
      ) : null}
      <SubmitButton label="Guardar borrador" pendingLabel="Guardando…" pending={save.pending} />
      {save.dialog}
    </form>
  );
}
