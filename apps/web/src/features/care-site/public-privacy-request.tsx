'use client';

import {
  PRIVACY_REQUEST_KINDS,
  PRIVACY_RIGHTS,
  privacyRequestKindOf,
  privacyRequestReceiptSchema,
  privacyRightSchema,
  publicPrivacyRequestSchema,
  type PrivacyRequestReceipt,
} from '@arza/contracts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  FormField,
  SelectField,
  TextareaField,
} from '@arza/ui';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type JSX, type SubmitEvent } from 'react';

import { FormSummary } from '../../components/form-summary';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';

// Derechos del titular en el sitio público (B42, decisión 1; Ley 1581, arts. 8, 14 y 15): conocer,
// corregir, suprimir o revocar, sin sesión. Al enviar aparecen el código y la fecha límite, y la
// constancia llega al correo. El campo «Sitio web» está oculto: solo lo llenan los programas.

interface Values {
  readonly right: string;
  readonly name: string;
  readonly document: string;
  readonly email: string;
  readonly phone: string;
  readonly description: string;
  readonly accepts: boolean;
  readonly website: string;
}

const EMPTY: Values = {
  right: 'know',
  name: '',
  document: '',
  email: '',
  phone: '',
  description: '',
  accepts: false,
  website: '',
};

const FIELDS = [
  { field: 'right', id: 'titular-derecho', label: 'Qué quiere hacer' },
  { field: 'name', id: 'titular-nombre', label: 'Nombre completo' },
  { field: 'document_number', id: 'titular-documento', label: 'Número de documento' },
  { field: 'email', id: 'titular-correo', label: 'Correo' },
  { field: 'phone', id: 'titular-telefono', label: 'Teléfono (opcional)' },
  { field: 'description', id: 'titular-descripcion', label: 'Detalle' },
  { field: 'accepts_privacy', id: 'titular-acepta', label: 'Tratamiento de datos' },
];

const RIGHT_OPTIONS = privacyRightSchema.options.map((value) => ({
  value,
  label: PRIVACY_RIGHTS[value],
}));

function bodyOf(values: Values): Record<string, unknown> {
  return {
    right: values.right,
    name: values.name,
    document_number: values.document,
    email: values.email,
    phone: values.phone.trim() === '' ? null : values.phone,
    description: values.description,
    accepts_privacy: values.accepts,
    website: values.website,
  };
}

function problemsOf(values: Values): Record<string, string> {
  const parsed = publicPrivacyRequestSchema.safeParse(bodyOf(values));
  if (parsed.success) return {};
  const found: Record<string, string> = {};
  for (const issue of parsed.error.issues) found[String(issue.path[0] ?? '')] ??= issue.message;
  return found;
}

function Received({ receipt }: { readonly receipt: PrivacyRequestReceipt }): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recibimos su {PRIVACY_REQUEST_KINDS[receipt.kind].toLowerCase()}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p>
          Su código es <strong className="text-lg">{receipt.code}</strong>. Guárdelo: lo necesita
          para consultar el estado.
        </p>
        <p>Le responderemos a más tardar el {formatDate(receipt.due_on)}.</p>
        <p className="text-sm text-muted-foreground">
          Antes de entregar o suprimir datos comprobaremos que usted es el titular. En unos minutos
          le llega la constancia a su correo.
        </p>
        <Link
          href="/derechos-del-titular/consulta"
          className="text-primary underline-offset-4 hover:underline"
        >
          Consultar el estado de una solicitud
        </Link>
      </CardContent>
    </Card>
  );
}

interface PartProps {
  readonly values: Values;
  readonly problems: Record<string, string>;
  readonly set: (patch: Partial<Values>) => void;
}

const TEXTS: readonly {
  key: 'name' | 'document' | 'email' | 'phone';
  id: string;
  label: string;
  field: string;
  type?: string;
}[] = [
  { key: 'name', id: 'titular-nombre', label: 'Nombre completo', field: 'name' },
  {
    key: 'document',
    id: 'titular-documento',
    label: 'Número de documento',
    field: 'document_number',
  },
  { key: 'email', id: 'titular-correo', label: 'Correo', field: 'email', type: 'email' },
  {
    key: 'phone',
    id: 'titular-telefono',
    label: 'Teléfono (opcional)',
    field: 'phone',
    type: 'tel',
  },
];

function Contact({ values, problems, set }: PartProps): JSX.Element {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {TEXTS.map((item) => (
        <FormField
          key={item.key}
          id={item.id}
          label={item.label}
          type={item.type ?? 'text'}
          value={values[item.key]}
          error={problems[item.field] ?? null}
          onChange={(event) => {
            set({ [item.key]: event.target.value });
          }}
        />
      ))}
    </div>
  );
}

function Request({ values, problems, set }: PartProps): JSX.Element {
  const kind = privacyRequestKindOf(privacyRightSchema.parse(values.right));
  return (
    <>
      <SelectField
        id="titular-derecho"
        label="Qué quiere hacer"
        options={RIGHT_OPTIONS}
        value={values.right}
        hint={
          kind === 'inquiry'
            ? 'Es una consulta: le respondemos en máximo 10 días hábiles.'
            : 'Es un reclamo: le respondemos en máximo 15 días hábiles.'
        }
        onChange={(event) => {
          set({ right: event.target.value });
        }}
      />
      <TextareaField
        id="titular-descripcion"
        label="Cuéntenos qué necesita"
        value={values.description}
        error={problems['description'] ?? null}
        onChange={(event) => {
          set({ description: event.target.value });
        }}
      />
    </>
  );
}

function Consent({ values, problems, set }: PartProps): JSX.Element {
  const problem = problems['accepts_privacy'];
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="titular-acepta" className="flex items-start gap-2 text-sm">
        <Checkbox
          id="titular-acepta"
          className="mt-0.5"
          checked={values.accepts}
          aria-invalid={problem === undefined ? undefined : true}
          onChange={(event) => {
            set({ accepts: event.target.checked });
          }}
        />
        <span>
          Autorizo el tratamiento de mis datos para atender esta solicitud, según la{' '}
          <Link href="/legal/privacidad" className="text-primary underline underline-offset-4">
            política de privacidad
          </Link>
          .
        </span>
      </label>
      {problem === undefined ? null : <p className="text-sm text-destructive">{problem}</p>}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="titular-sitio">Sitio web (déjelo vacío)</label>
        <input
          id="titular-sitio"
          tabIndex={-1}
          autoComplete="off"
          value={values.website}
          onChange={(event) => {
            set({ website: event.target.value });
          }}
        />
      </div>
    </div>
  );
}

export function PublicPrivacyRequestForm(): JSX.Element {
  const api = useApiClient();
  const [values, setValues] = useState(EMPTY);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const file = useMutation({
    mutationFn: (body: object) =>
      api.post('/v1/public/privacy-requests', { body, schema: privacyRequestReceiptSchema }),
  });
  const set = (patch: Partial<Values>): void => {
    setValues({ ...values, ...patch });
  };
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = problemsOf(values);
    setProblems(found);
    if (Object.keys(found).length === 0) file.mutate(bodyOf(values));
  };
  if (file.data !== undefined) return <Received receipt={file.data} />;
  return (
    <form noValidate onSubmit={submit} className="relative flex flex-col gap-4">
      <FormSummary problems={problems} fields={FIELDS} />
      {file.isError ? <FormError error={file.error} /> : null}
      <Request values={values} problems={problems} set={set} />
      <Contact values={values} problems={problems} set={set} />
      <Consent values={values} problems={problems} set={set} />
      <SubmitButton label="Enviar la solicitud" pendingLabel="Enviando…" pending={file.isPending} />
    </form>
  );
}
