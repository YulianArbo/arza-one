'use client';

import type { z } from 'zod';
import { FormField, TextareaField } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { FormSummary } from '../../components/form-summary';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { BODY_HELP } from './labels';

// Formulario de una página o de un texto legal (B41): título, texto sencillo y, en las páginas,
// la dirección y el resumen. Se valida con el mismo esquema del contrato que usa la API.

export interface ContentValues {
  readonly title: string;
  readonly body: string;
  readonly slug: string;
  readonly summary: string;
}

type Field = keyof ContentValues;

const MESSAGES: Readonly<Record<string, string>> = {
  title: 'Revise la longitud del título.',
  body: 'El texto debe tener al menos 20 caracteres.',
  slug: 'Use minúsculas, números y guiones, sin tildes ni espacios, y no una dirección de la plataforma.',
  summary: 'El resumen debe tener máximo 300 caracteres.',
};

const FIELDS: readonly {
  readonly field: Field;
  readonly suffix: string;
  readonly label: string;
  readonly address: boolean;
}[] = [
  { field: 'slug', suffix: 'direccion', label: 'Dirección (por ejemplo, nosotros)', address: true },
  { field: 'title', suffix: 'titulo', label: 'Título', address: false },
  {
    field: 'summary',
    suffix: 'resumen',
    label: 'Resumen para buscadores (opcional)',
    address: true,
  },
];

function problemsOf(schema: z.ZodType, body: object): Record<string, string> {
  const result = schema.safeParse(body);
  if (result.success) return {};
  const found: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '');
    found[field] ??= MESSAGES[field] ?? issue.message;
  }
  return found;
}

interface ContentFormProps {
  readonly prefix: string;
  readonly initial: ContentValues;
  /** Esquema del contrato con que se valida el cuerpo. */
  readonly schema: z.ZodType;
  readonly withAddress: boolean;
  readonly toBody: (values: ContentValues) => object;
  readonly onSubmit: (body: object) => void;
  readonly pending: boolean;
  readonly error: unknown;
}

function useContentForm(props: ContentFormProps) {
  const [values, setValues] = useState(props.initial);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const set = (patch: Partial<ContentValues>): void => {
    setValues({ ...values, ...patch });
  };
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const body = props.toBody(values);
    const found = problemsOf(props.schema, body);
    setProblems(found);
    if (Object.keys(found).length === 0) props.onSubmit(body);
  };
  return { values, problems, set, submit };
}

export function ContentForm(props: ContentFormProps): JSX.Element {
  const { values, problems, set, submit } = useContentForm(props);
  const visible = FIELDS.filter((item) => props.withAddress || !item.address);
  const summary = [...visible, { field: 'body', suffix: 'texto', label: 'Texto' }].map((item) => ({
    field: item.field,
    id: `${props.prefix}-${item.suffix}`,
    label: item.label,
  }));
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <FormSummary problems={problems} fields={summary} />
      {props.error === null ? null : <FormError error={props.error} />}
      {visible.map((item) => (
        <FormField
          key={item.field}
          id={`${props.prefix}-${item.suffix}`}
          label={item.label}
          value={values[item.field]}
          error={problems[item.field] ?? null}
          onChange={(event) => {
            set({ [item.field]: event.target.value });
          }}
        />
      ))}
      <TextareaField
        id={`${props.prefix}-texto`}
        label="Texto"
        rows={12}
        hint={BODY_HELP}
        value={values.body}
        error={problems['body'] ?? null}
        onChange={(event) => {
          set({ body: event.target.value });
        }}
      />
      <SubmitButton label="Guardar borrador" pendingLabel="Guardando…" pending={props.pending} />
    </form>
  );
}
