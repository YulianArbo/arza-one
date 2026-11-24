'use client';

import {
  createPrivacyRequestSchema,
  PRIVACY_RIGHTS,
  privacyRequestKindOf,
  type CreatePrivacyRequest,
} from '@arza/contracts';
import { useRouter } from 'next/navigation';
import type { JSX } from 'react';

import { bogotaToday } from '../crm/labels';
import {
  Choice,
  DialogForm,
  Fields,
  optionsOf,
  useDialogForm,
  type FieldSpec,
} from '../projects/form-bits';
import { B42_PATHS } from './request-labels';
import { useCreatePrivacyRequest } from './request-queries';

// Registro de una solicitud que llegó por correo, teléfono, en persona o por escrito (B42,
// decisión 1). Recibe su código y la fecha límite legal; el Oficial recibe la tarea.

const CHANNELS = {
  email: 'Correo',
  phone: 'Teléfono',
  in_person: 'En persona',
  written: 'Por escrito',
} as const;

type Key = 'name' | 'email' | 'phone' | 'document' | 'description' | 'receivedOn';

interface Values extends Record<Key, string> {
  readonly channel: string;
  readonly right: string;
}

const SPECS: readonly FieldSpec<Key>[] = [
  { key: 'name', field: 'requester_name', id: 'solicitud-nombre', label: 'Nombre del titular' },
  {
    key: 'email',
    field: 'requester_email',
    id: 'solicitud-correo',
    label: 'Correo (opcional)',
    hint: 'Allí le llegan la constancia y la respuesta.',
  },
  {
    key: 'phone',
    field: 'requester_phone',
    id: 'solicitud-telefono',
    label: 'Teléfono (opcional)',
  },
  {
    key: 'document',
    field: 'document_number',
    id: 'solicitud-documento',
    label: 'Número de documento (opcional)',
  },
  {
    key: 'description',
    field: 'description',
    id: 'solicitud-descripcion',
    label: 'Qué pide',
    multiline: true,
  },
  {
    key: 'receivedOn',
    field: 'received_on',
    id: 'solicitud-recibida',
    label: 'Día en que llegó',
    type: 'date',
    hint: 'El plazo legal se cuenta desde el día hábil siguiente.',
  },
];

const SUMMARY = [
  { field: 'right', id: 'solicitud-derecho', label: 'Qué pide el titular' },
  { field: 'channel', id: 'solicitud-canal', label: 'Por dónde llegó' },
  ...SPECS.map((spec) => ({ field: spec.field, id: spec.id, label: spec.label })),
];

function bodyOf(values: Values): unknown {
  const blank = (text: string): string | null => (text.trim() === '' ? null : text.trim());
  return {
    channel: values.channel,
    right: values.right,
    requester_name: values.name,
    requester_email: blank(values.email),
    requester_phone: blank(values.phone),
    document_number: blank(values.document),
    description: values.description,
    received_on: values.receivedOn,
  };
}

function problemsOf(values: Values): Record<string, string> {
  const parsed = createPrivacyRequestSchema.safeParse(bodyOf(values));
  if (parsed.success) return {};
  const found: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? '');
    found[field] ??= issue.message;
  }
  return found;
}

const INITIAL: Omit<Values, 'receivedOn'> = {
  channel: 'email',
  right: 'know',
  name: '',
  email: '',
  phone: '',
  document: '',
  description: '',
};

function kindHint(right: string): string {
  const kind = privacyRequestKindOf(createPrivacyRequestSchema.shape.right.parse(right));
  return kind === 'inquiry'
    ? 'Es una consulta: 10 días hábiles.'
    : 'Es un reclamo: 15 días hábiles.';
}

/** El derecho y el canal, con el plazo que le corresponde. */
function Choices(props: {
  readonly values: Values;
  readonly onSet: (patch: Partial<Values>) => void;
}): JSX.Element {
  return (
    <>
      <Choice
        id="solicitud-derecho"
        label="Qué pide el titular"
        options={optionsOf(PRIVACY_RIGHTS)}
        value={props.values.right}
        hint={kindHint(props.values.right)}
        onValue={(right) => {
          props.onSet({ right });
        }}
      />
      <Choice
        id="solicitud-canal"
        label="Por dónde llegó"
        options={optionsOf(CHANNELS)}
        value={props.values.channel}
        onValue={(channel) => {
          props.onSet({ channel });
        }}
      />
    </>
  );
}

export function RequestForm(): JSX.Element {
  const router = useRouter();
  const create = useCreatePrivacyRequest((id) => {
    router.push(B42_PATHS.request(id));
  });
  const form = useDialogForm<Values>(
    { ...INITIAL, receivedOn: bogotaToday() },
    problemsOf,
    (values) => {
      create.execute(
        createPrivacyRequestSchema.parse(bodyOf(values)) satisfies CreatePrivacyRequest,
      );
    },
  );
  return (
    <DialogForm
      problems={form.problems}
      fields={SUMMARY}
      action={create}
      submitLabel="Registrar"
      onSubmit={form.submit}
    >
      <Choices values={form.values} onSet={form.set} />
      <Fields
        specs={SPECS}
        values={form.values}
        problems={form.problems}
        onChange={(key, value) => {
          form.set({ [key]: value });
        }}
      />
    </DialogForm>
  );
}
