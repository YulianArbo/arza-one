'use client';

import {
  PQRSF_TYPES,
  pqrsfTypeSchema,
  publicPqrsfFiledSchema,
  type PublicPqrsfFiled,
} from '@arza/contracts';
import {
  Alert,
  AlertDescription,
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

// Radicar una PQRSF en el sitio público (B29, ficha 17.9; Ley 1480, art. 50): sin sesión, con
// aceptación del tratamiento de datos. Al enviarla, el radicado y la fecha límite aparecen en
// pantalla y el acuse llega al correo. El campo «Sitio web» está oculto: solo lo llenan los
// programas que llenan todo (decisión 12).

interface Values {
  readonly type: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly subject: string;
  readonly description: string;
  readonly accepts: boolean;
  readonly website: string;
}

const EMPTY: Values = {
  type: 'petition',
  name: '',
  email: '',
  phone: '',
  subject: '',
  description: '',
  accepts: false,
  website: '',
};

const SUMMARY_FIELDS = [
  { field: 'name', id: 'pqrsf-publica-nombre', label: 'Nombre' },
  { field: 'email', id: 'pqrsf-publica-correo', label: 'Correo' },
  { field: 'phone', id: 'pqrsf-publica-telefono', label: 'Teléfono' },
  { field: 'subject', id: 'pqrsf-publica-asunto', label: 'Asunto' },
  { field: 'description', id: 'pqrsf-publica-descripcion', label: 'Descripción' },
  { field: 'accepts_privacy', id: 'pqrsf-publica-acepta', label: 'Tratamiento de datos' },
];

const TYPE_OPTIONS = pqrsfTypeSchema.options.map((type) => ({
  value: type,
  label: PQRSF_TYPES[type],
}));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function problemsOf(values: Values): Record<string, string> {
  const found: Record<string, string> = {};
  if (values.name.trim().length < 3) found['name'] = 'Escriba su nombre completo.';
  if (!EMAIL.test(values.email.trim()))
    found['email'] = 'Escriba un correo válido: allí le llega el acuse.';
  const phone = values.phone.trim();
  if (phone !== '' && !/^[+\d][\d\s-]{6,19}$/u.test(phone))
    found['phone'] = 'Escriba un teléfono de 7 a 20 números.';
  if (values.subject.trim().length < 3) found['subject'] = 'Escriba un asunto corto.';
  if (values.description.trim().length < 10)
    found['description'] = 'Cuéntenos con detalle (al menos 10 letras).';
  if (!values.accepts)
    found['accepts_privacy'] = 'Para radicar debe aceptar el tratamiento de sus datos.';
  return found;
}

function bodyOf(values: Values): object {
  return {
    type: values.type,
    name: values.name.trim(),
    email: values.email.trim(),
    phone: values.phone.trim() === '' ? null : values.phone.trim(),
    subject: values.subject.trim(),
    description: values.description.trim(),
    accepts_privacy: values.accepts,
    website: values.website,
  };
}

function Filed({ filed }: { readonly filed: PublicPqrsfFiled }): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recibimos su {PQRSF_TYPES[filed.type].toLowerCase()}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p>
          Su número de radicado es <strong className="text-lg">{filed.code}</strong>. Guárdelo: lo
          necesita para consultar el estado.
        </p>
        <p>Le responderemos a más tardar el {formatDate(filed.due_on)}.</p>
        <p className="text-sm text-muted-foreground">
          En unos minutos le llega el acuse de recibo a su correo, con el radicado y la fecha
          límite.
        </p>
        <Link href="/pqrsf/consulta" className="text-primary underline-offset-4 hover:underline">
          Consultar el estado de una PQRSF
        </Link>
      </CardContent>
    </Card>
  );
}

function ConsentBox(props: {
  readonly checked: boolean;
  readonly problem: string | undefined;
  readonly onChange: (checked: boolean) => void;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="pqrsf-publica-acepta" className="flex items-start gap-2 text-sm">
        <Checkbox
          id="pqrsf-publica-acepta"
          className="mt-0.5"
          checked={props.checked}
          aria-invalid={props.problem === undefined ? undefined : true}
          aria-describedby={props.problem === undefined ? undefined : 'pqrsf-publica-acepta-error'}
          onChange={(event) => {
            props.onChange(event.target.checked);
          }}
        />
        <span>
          Autorizo el tratamiento de mis datos personales para atender esta solicitud, según la{' '}
          <Link href="/legal/privacidad" className="text-primary underline underline-offset-4">
            política de privacidad
          </Link>
          .
        </span>
      </label>
      {props.problem === undefined ? null : (
        <p id="pqrsf-publica-acepta-error" className="text-sm text-destructive">
          {props.problem}
        </p>
      )}
    </div>
  );
}

function Honeypot(props: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}): JSX.Element {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label htmlFor="pqrsf-publica-sitio">Sitio web (déjelo vacío)</label>
      <input
        id="pqrsf-publica-sitio"
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

type TextKey = 'name' | 'email' | 'phone' | 'subject';

const CONTACT: readonly {
  readonly key: TextKey;
  readonly id: string;
  readonly label: string;
  readonly type?: 'email' | 'tel';
  readonly autoComplete?: string;
}[] = [
  { key: 'name', id: 'pqrsf-publica-nombre', label: 'Nombre completo', autoComplete: 'name' },
  {
    key: 'email',
    id: 'pqrsf-publica-correo',
    label: 'Correo',
    type: 'email',
    autoComplete: 'email',
  },
  {
    key: 'phone',
    id: 'pqrsf-publica-telefono',
    label: 'Teléfono (opcional)',
    type: 'tel',
    autoComplete: 'tel',
  },
  { key: 'subject', id: 'pqrsf-publica-asunto', label: 'Asunto' },
];

interface FieldsProps {
  readonly values: Values;
  readonly problems: Record<string, string>;
  readonly set: (patch: Partial<Values>) => void;
}

function ContactFields({ values, problems, set }: FieldsProps): JSX.Element {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {CONTACT.map((field) => (
        <FormField
          key={field.key}
          id={field.id}
          label={field.label}
          type={field.type ?? 'text'}
          {...(field.autoComplete === undefined ? {} : { autoComplete: field.autoComplete })}
          value={values[field.key]}
          error={problems[field.key] ?? null}
          onChange={(event) => {
            set({ [field.key]: event.target.value });
          }}
        />
      ))}
    </div>
  );
}

function TextFields({ values, problems, set }: FieldsProps): JSX.Element {
  return (
    <>
      <SelectField
        id="pqrsf-publica-tipo"
        label="¿Qué quiere presentar?"
        options={TYPE_OPTIONS}
        value={values.type}
        onChange={(event) => {
          set({ type: event.target.value });
        }}
      />
      <ContactFields values={values} problems={problems} set={set} />
      <TextareaField
        id="pqrsf-publica-descripcion"
        label="Cuéntenos qué pasó o qué necesita"
        value={values.description}
        error={problems['description'] ?? null}
        onChange={(event) => {
          set({ description: event.target.value });
        }}
      />
    </>
  );
}

/** El formulario: valores, problemas y el envío al sitio público. */
function usePublicFiling() {
  const api = useApiClient();
  const [values, setValues] = useState(EMPTY);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const file = useMutation({
    mutationFn: (body: object) =>
      api.post('/v1/public/pqrsf', { body, schema: publicPqrsfFiledSchema }),
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
  return { values, problems, set, submit, file };
}

export function PublicPqrsfForm(): JSX.Element {
  const { values, problems, set, submit, file } = usePublicFiling();
  if (file.data !== undefined) return <Filed filed={file.data} />;
  return (
    <form noValidate onSubmit={submit} className="relative flex flex-col gap-4">
      <FormSummary problems={problems} fields={SUMMARY_FIELDS} />
      {file.isError ? <FormError error={file.error} /> : null}
      <Alert tone="info">
        <AlertDescription>
          Las consultas y los reclamos sobre sus datos personales se atienden en los plazos de la
          Ley 1581 de 2012.
        </AlertDescription>
      </Alert>
      <TextFields values={values} problems={problems} set={set} />
      <ConsentBox
        checked={values.accepts}
        problem={problems['accepts_privacy']}
        onChange={(accepts) => {
          set({ accepts });
        }}
      />
      <Honeypot
        value={values.website}
        onChange={(website) => {
          set({ website });
        }}
      />
      <SubmitButton label="Radicar" pendingLabel="Enviando…" pending={file.isPending} />
    </form>
  );
}
