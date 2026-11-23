'use client';

import { publicFormInfoSchema, type FormNotice, type PublicFormInfo } from '@arza/contracts';
import { Checkbox, FormField } from '@arza/ui';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import Link from 'next/link';
import type { JSX } from 'react';

import type { SummaryField } from '../../components/form-summary';
import { useApiClient } from '../../lib/api/api-provider';

// Piezas comunes de los formularios de contacto y cotización (B41, decisión 7): los datos de la
// persona, la casilla de autorización con el aviso vigente (nunca viene marcada) y el campo trampa
// para robots, que las personas no ven (decisión 8).

export interface VisitorValues {
  readonly first_name: string;
  readonly last_name: string;
  readonly email: string;
  readonly phone: string;
  readonly company: string;
  readonly accepts: boolean;
  readonly nickname: string;
}

export const EMPTY_VISITOR: VisitorValues = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  company: '',
  accepts: false,
  nickname: '',
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function visitorProblems(values: VisitorValues): Record<string, string> {
  const found: Record<string, string> = {};
  if (values.first_name.trim().length < 2) found['first_name'] = 'Escriba sus nombres.';
  if (values.last_name.trim().length < 2) found['last_name'] = 'Escriba sus apellidos.';
  if (!EMAIL.test(values.email.trim()))
    found['email'] = 'Escriba un correo válido: allí le llega la confirmación.';
  const phone = values.phone.trim();
  if (phone !== '' && !/^\+?[0-9 ]{7,20}$/u.test(phone))
    found['phone'] = 'Escriba solo números, de 7 a 20, con el indicativo si es del exterior.';
  if (!values.accepts)
    found['accept_privacy'] = 'Para enviar debe autorizar el tratamiento de sus datos.';
  return found;
}

export function visitorBody(values: VisitorValues, notice: FormNotice): object {
  const optional = (value: string): string | null => (value.trim() === '' ? null : value.trim());
  return {
    first_name: values.first_name.trim(),
    last_name: values.last_name.trim(),
    email: values.email.trim(),
    phone: optional(values.phone),
    company: optional(values.company),
    notice_id: notice.id,
    accept_privacy: values.accepts,
    nickname: values.nickname,
  };
}

export function visitorSummary(prefix: string): SummaryField[] {
  return [
    { field: 'first_name', id: `${prefix}-nombres`, label: 'Nombres' },
    { field: 'last_name', id: `${prefix}-apellidos`, label: 'Apellidos' },
    { field: 'email', id: `${prefix}-correo`, label: 'Correo' },
    { field: 'phone', id: `${prefix}-telefono`, label: 'Teléfono' },
  ];
}

/** El aviso de autorización vigente que acompaña a los formularios. */
export function useFormNotice(): UseQueryResult<PublicFormInfo> {
  const api = useApiClient();
  return useQuery({
    queryKey: ['site', 'form-notice'],
    queryFn: ({ signal }) =>
      api.get('/v1/public/forms/notice', { schema: publicFormInfoSchema, signal }),
  });
}

type TextKey = 'first_name' | 'last_name' | 'email' | 'phone' | 'company';

const FIELDS: readonly {
  readonly key: TextKey;
  readonly suffix: string;
  readonly label: string;
  readonly type?: 'email' | 'tel';
  readonly autoComplete: string;
}[] = [
  { key: 'first_name', suffix: 'nombres', label: 'Nombres', autoComplete: 'given-name' },
  { key: 'last_name', suffix: 'apellidos', label: 'Apellidos', autoComplete: 'family-name' },
  { key: 'email', suffix: 'correo', label: 'Correo', type: 'email', autoComplete: 'email' },
  {
    key: 'phone',
    suffix: 'telefono',
    label: 'Teléfono (opcional)',
    type: 'tel',
    autoComplete: 'tel',
  },
  {
    key: 'company',
    suffix: 'empresa',
    label: 'Empresa (opcional)',
    autoComplete: 'organization',
  },
];

export function VisitorFields(props: {
  readonly prefix: string;
  readonly values: VisitorValues;
  readonly problems: Record<string, string>;
  readonly set: (patch: Partial<VisitorValues>) => void;
}): JSX.Element {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {FIELDS.map((field) => (
        <FormField
          key={field.key}
          id={`${props.prefix}-${field.suffix}`}
          label={field.label}
          type={field.type ?? 'text'}
          autoComplete={field.autoComplete}
          value={props.values[field.key]}
          error={props.problems[field.key] ?? null}
          onChange={(event) => {
            props.set({ [field.key]: event.target.value });
          }}
        />
      ))}
    </div>
  );
}

function NoticeDetails({ notice }: { readonly notice: FormNotice }): JSX.Element {
  return (
    <details className="rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Leer el aviso: {notice.title} (versión {notice.version_number})
      </summary>
      <p className="mt-2 whitespace-pre-line text-muted-foreground">{notice.body}</p>
    </details>
  );
}

/** Casilla de autorización, desmarcada, con el aviso que se acepta (numeral 20.2). */
export function ConsentBox(props: {
  readonly prefix: string;
  readonly notice: FormNotice;
  readonly checked: boolean;
  readonly problem: string | undefined;
  readonly onChange: (checked: boolean) => void;
}): JSX.Element {
  const id = `${props.prefix}-acepta`;
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-2">
      <NoticeDetails notice={props.notice} />
      <label htmlFor={id} className="flex items-start gap-2 text-sm">
        <Checkbox
          id={id}
          className="mt-0.5"
          checked={props.checked}
          aria-invalid={props.problem === undefined ? undefined : true}
          aria-describedby={props.problem === undefined ? undefined : errorId}
          onChange={(event) => {
            props.onChange(event.target.checked);
          }}
        />
        <span>
          Autorizo el tratamiento de mis datos personales según el aviso anterior y la{' '}
          <Link href="/legal/privacidad" className="text-primary underline underline-offset-4">
            política de tratamiento de datos
          </Link>
          .
        </span>
      </label>
      {props.problem === undefined ? null : (
        <p id={errorId} className="text-sm text-destructive">
          {props.problem}
        </p>
      )}
    </div>
  );
}

/** Campo trampa: oculto para las personas; solo lo llenan los programas que llenan todo. */
export function Honeypot(props: {
  readonly prefix: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): JSX.Element {
  const id = `${props.prefix}-apodo`;
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label htmlFor={id}>Apodo (déjelo vacío)</label>
      <input
        id={id}
        tabIndex={-1}
        autoComplete="off"
        value={props.value}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
      />
    </div>
  );
}
