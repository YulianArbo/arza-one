'use client';

import { createdResponseSchema, pqrsfTypeSchema } from '@arza/contracts';
import { Card, CardContent } from '@arza/ui';
import { useRouter } from 'next/navigation';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { useApiClient } from '../../lib/api/api-provider';
import { optionsOf } from '../crm/labels';
import {
  ChoiceFields,
  DialogForm,
  Fields,
  optional,
  useDialogForm,
  type ChoiceSpec,
  type FieldSpec,
} from '../projects/form-bits';
import { PQRSF_TYPES, SERVICE_PATHS } from './labels';
import { useServiceAction } from './queries';

// Registrar una PQRSF que llegó por correo, teléfono o en persona (B29, FT-SAC-002). Recibe su
// radicado y su plazo al guardarla; si trae correo, el acuse sale por correo.

interface Values {
  readonly channel: string;
  readonly type: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly subject: string;
  readonly description: string;
}

const EMPTY: Values = {
  channel: 'phone',
  type: 'petition',
  name: '',
  email: '',
  phone: '',
  subject: '',
  description: '',
};

type TextKey = 'name' | 'email' | 'phone' | 'subject' | 'description';

const TEXTS: readonly FieldSpec<TextKey>[] = [
  {
    key: 'name',
    field: 'requester_name',
    id: 'pqrsf-nombre',
    label: 'Nombre de quien la presenta',
  },
  {
    key: 'email',
    field: 'requester_email',
    id: 'pqrsf-correo',
    label: 'Correo (opcional)',
    hint: 'Allí llegan el acuse y la respuesta. Escriba un correo o un teléfono.',
  },
  { key: 'phone', field: 'requester_phone', id: 'pqrsf-telefono', label: 'Teléfono (opcional)' },
  { key: 'subject', field: 'subject', id: 'pqrsf-asunto', label: 'Asunto' },
  {
    key: 'description',
    field: 'description',
    id: 'pqrsf-descripcion',
    label: 'Qué dice la persona',
    multiline: true,
  },
];

const CHOICES: readonly ChoiceSpec<'channel' | 'type'>[] = [
  {
    key: 'channel',
    field: 'channel',
    id: 'pqrsf-canal',
    label: 'Por dónde llegó',
    options: [
      { value: 'phone', label: 'Teléfono' },
      { value: 'email', label: 'Correo' },
      { value: 'in_person', label: 'En persona' },
    ],
  },
  {
    key: 'type',
    field: 'type',
    id: 'pqrsf-tipo',
    label: 'Tipo',
    options: optionsOf(pqrsfTypeSchema.options, PQRSF_TYPES),
  },
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function problemsOf(values: Values): Record<string, string> {
  const found: Record<string, string> = {};
  if (values.name.trim().length < 3) found['requester_name'] = 'Escriba el nombre.';
  const email = values.email.trim();
  if (email !== '' && !EMAIL.test(email)) found['requester_email'] = 'Revise el correo.';
  if (email === '' && values.phone.trim() === '') {
    found['requester_email'] = 'Escriba un correo o un teléfono para responderle.';
  }
  if (values.subject.trim().length < 3) found['subject'] = 'Escriba un asunto corto.';
  if (values.description.trim().length < 10) {
    found['description'] = 'Cuente con detalle lo que dice (al menos 10 letras).';
  }
  return found;
}

function bodyOf(values: Values): object {
  return {
    channel: values.channel,
    type: values.type,
    requester_name: values.name.trim(),
    requester_email: optional(values.email),
    requester_phone: optional(values.phone, 7),
    subject: values.subject.trim(),
    description: values.description.trim(),
  };
}

/** Registra la PQRSF y abre su ficha. */
function useCreatePqrsf() {
  const api = useApiClient();
  const router = useRouter();
  return useServiceAction<object, string>(
    async (body, csrfToken) =>
      (await api.post('/v1/pqrsf', { body, schema: createdResponseSchema, csrfToken })).id,
    (id) => {
      router.push(SERVICE_PATHS.pqrsf(id));
    },
  );
}

export function PqrsfForm(): JSX.Element {
  const create = useCreatePqrsf();
  const form = useDialogForm(EMPTY, problemsOf, (values) => {
    create.execute(bodyOf(values));
  });
  const change = (key: string, value: string): void => {
    form.set({ [key]: value });
  };
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Registrar una PQRSF"
        description="Para lo que llegó por teléfono, correo o en persona. Recibe radicado y plazo al guardarla."
      />
      <Card>
        <CardContent className="pt-6">
          <DialogForm
            problems={form.problems}
            fields={[...CHOICES, ...TEXTS]}
            action={create}
            submitLabel="Registrar la PQRSF"
            onSubmit={form.submit}
          >
            <ChoiceFields
              specs={CHOICES}
              values={form.values}
              problems={form.problems}
              onChange={change}
            />
            <Fields specs={TEXTS} values={form.values} problems={form.problems} onChange={change} />
          </DialogForm>
        </CardContent>
      </Card>
    </div>
  );
}
