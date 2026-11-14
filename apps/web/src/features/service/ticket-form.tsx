'use client';

import { createdResponseSchema, ticketCategorySchema, ticketPrioritySchema } from '@arza/contracts';
import { Card, CardContent, FormField, SelectField } from '@arza/ui';
import { useRouter } from 'next/navigation';
import { useState, type JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { useApiClient } from '../../lib/api/api-provider';
import { useParties } from '../parties/queries';
import {
  ChoiceFields,
  DialogForm,
  Fields,
  optional,
  optionsOf,
  useDialogForm,
  type ChoiceSpec,
  type FieldSpec,
} from '../projects/form-bits';
import { usePermissions } from '../session/permissions';
import { SERVICE_PATHS, TICKET_CATEGORIES, TICKET_PRIORITIES } from './labels';
import { useServiceAction } from './queries';

// Registrar un tiquete (B28, FT-SAC-001). Servicio al cliente lo registra a nombre de un cliente de
// Terceros con el canal por el que llegó; un colaborador registra su propia solicitud, como una
// falla de ARZA ONE. El reloj del acuerdo arranca al guardarlo.

interface Values {
  readonly subject: string;
  readonly description: string;
  readonly category: string;
  readonly priority: string;
  readonly channel: string;
  readonly requesterName: string;
  readonly requesterEmail: string;
  readonly partyId: string;
}

const EMPTY: Values = {
  subject: '',
  description: '',
  category: 'support',
  priority: 'medium',
  channel: 'internal',
  requesterName: '',
  requesterEmail: '',
  partyId: '',
};

const TEXTS: readonly FieldSpec<'subject' | 'description'>[] = [
  { key: 'subject', field: 'subject', id: 'tiquete-asunto', label: 'Asunto' },
  {
    key: 'description',
    field: 'description',
    id: 'tiquete-descripcion',
    label: 'Qué pasa',
    multiline: true,
  },
];

const CHOICES: readonly ChoiceSpec<'category' | 'priority'>[] = [
  {
    key: 'category',
    field: 'category',
    id: 'tiquete-categoria',
    label: 'Categoría',
    options: optionsOf(TICKET_CATEGORIES),
  },
  {
    key: 'priority',
    field: 'priority',
    id: 'tiquete-prioridad',
    label: 'Prioridad',
    hint: 'Crítica: el servicio del cliente está detenido; avisa de inmediato (PT-TEC-003).',
    options: optionsOf(TICKET_PRIORITIES),
  },
];

const CHANNELS = [
  { value: 'internal', label: 'Registro interno' },
  { value: 'email', label: 'Correo' },
  { value: 'phone', label: 'Teléfono' },
];

function problemsOf(values: Values): Record<string, string> {
  const found: Record<string, string> = {};
  if (values.subject.trim().length < 3) found['subject'] = 'Escriba un asunto corto.';
  if (values.description.trim().length < 3) found['description'] = 'Describa la solicitud.';
  const email = values.requesterEmail.trim();
  if (email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    found['requester_email'] = 'Revise el correo.';
  }
  return found;
}

function bodyOf(values: Values): object {
  return {
    subject: values.subject.trim(),
    description: values.description.trim(),
    category: ticketCategorySchema.parse(values.category),
    priority: ticketPrioritySchema.parse(values.priority),
    channel: values.channel,
    requester_name: optional(values.requesterName),
    requester_email: optional(values.requesterEmail),
    party_id: values.partyId === '' ? null : values.partyId,
  };
}

interface PartProps {
  readonly values: Values;
  readonly set: (patch: Partial<Values>) => void;
}

/** Cliente de Terceros: se busca por nombre y se elige de la lista. */
function ClientPicker(props: PartProps): JSX.Element {
  const [search, setSearch] = useState('');
  const parties = useParties({ q: search, role: '', status: '' }, null).data?.data ?? [];
  const options = [
    { value: '', label: 'Sin cliente' },
    ...parties.map((party) => ({ value: party.id, label: party.name })),
  ];
  return (
    <>
      <FormField
        id="tiquete-buscar-cliente"
        label="Buscar el cliente en Terceros"
        type="search"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          props.set({ partyId: '' });
        }}
      />
      <SelectField
        id="tiquete-cliente"
        label="Cliente (opcional)"
        options={options}
        value={props.values.partyId}
        onChange={(event) => {
          props.set({ partyId: event.target.value });
        }}
      />
    </>
  );
}

/** Quién reporta en el cliente y por dónde llegó. */
function ClientFields(props: PartProps): JSX.Element {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ClientPicker {...props} />
      <FormField
        id="tiquete-quien"
        label="Quién reporta en el cliente (opcional)"
        value={props.values.requesterName}
        onChange={(event) => {
          props.set({ requesterName: event.target.value });
        }}
      />
      <FormField
        id="tiquete-correo"
        label="Correo de quien reporta (opcional)"
        type="email"
        hint="Al resolver el tiquete, allí le llega la encuesta de satisfacción."
        value={props.values.requesterEmail}
        onChange={(event) => {
          props.set({ requesterEmail: event.target.value });
        }}
      />
      <SelectField
        id="tiquete-canal"
        label="Por dónde llegó"
        options={CHANNELS}
        value={props.values.channel}
        onChange={(event) => {
          props.set({ channel: event.target.value });
        }}
      />
    </div>
  );
}

/** Registra el tiquete y abre su ficha. */
function useCreateTicket() {
  const api = useApiClient();
  const router = useRouter();
  const create = useServiceAction<object, string>(
    async (body, csrfToken) =>
      (await api.post('/v1/tickets', { body, schema: createdResponseSchema, csrfToken })).id,
    (id) => {
      router.push(SERVICE_PATHS.ticket(id));
    },
  );
  const form = useDialogForm(EMPTY, problemsOf, (values) => {
    create.execute(bodyOf(values));
  });
  return { create, form };
}

export function TicketForm(): JSX.Element {
  const { can } = usePermissions();
  const { create, form } = useCreateTicket();
  const change = (key: string, value: string): void => {
    form.set({ [key]: value });
  };
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Nuevo tiquete"
        description="El reloj del acuerdo de tiempo de su prioridad arranca al registrarlo."
      />
      <Card>
        <CardContent className="pt-6">
          <DialogForm
            problems={form.problems}
            fields={TEXTS}
            action={create}
            submitLabel="Registrar el tiquete"
            onSubmit={form.submit}
          >
            <Fields specs={TEXTS} values={form.values} problems={form.problems} onChange={change} />
            <ChoiceFields
              specs={CHOICES}
              values={form.values}
              problems={form.problems}
              onChange={change}
            />
            {can('party.read') ? <ClientFields values={form.values} set={form.set} /> : null}
          </DialogForm>
        </CardContent>
      </Card>
    </div>
  );
}
