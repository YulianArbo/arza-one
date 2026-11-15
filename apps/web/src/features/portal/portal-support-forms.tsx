'use client';

import {
  PQRSF_TYPES,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  createdResponseSchema,
  portalPqrsfFiledSchema,
} from '@arza/contracts';
import { Alert, AlertDescription, Button } from '@arza/ui';
import { useRouter } from 'next/navigation';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { RecordDialog } from '../organization/record-dialog';
import {
  ChoiceFields,
  DialogForm,
  Fields,
  optionsOf,
  summaryOf,
  useDialogForm,
  type ChoiceSpec,
  type FieldSpec,
} from '../projects/form-bits';
import { usePortalAction, usePortalProjects } from './portal-queries';
import { PORTAL_PATHS } from './portal-sections';

// Pedir soporte y radicar una PQRSF desde el portal (B30). Validan al enviar, con el mensaje junto
// al campo y el resumen arriba (numeral 16.4). La API los registra a nombre de la persona.

type TicketKey = 'subject' | 'description' | 'category' | 'priority' | 'project';

const TICKET_TEXTS: readonly FieldSpec<TicketKey>[] = [
  { key: 'subject', field: 'subject', id: 'soporte-asunto', label: 'Asunto' },
  {
    key: 'description',
    field: 'description',
    id: 'soporte-descripcion',
    label: 'Qué pasa',
    hint: 'Cuéntenos qué intentó hacer, qué esperaba y qué pasó.',
    multiline: true,
  },
];

function ticketChoices(
  projects: readonly { readonly id: string; readonly name: string }[],
): ChoiceSpec<TicketKey>[] {
  return [
    {
      key: 'category',
      field: 'category',
      id: 'soporte-categoria',
      label: 'Tipo de solicitud',
      options: optionsOf(TICKET_CATEGORIES).filter((option) => option.value !== 'platform'),
    },
    {
      key: 'priority',
      field: 'priority',
      id: 'soporte-prioridad',
      label: 'Qué tan urgente es',
      hint: 'Crítica: su servicio está detenido y no puede trabajar.',
      options: optionsOf(TICKET_PRIORITIES),
    },
    {
      key: 'project',
      field: 'project_id',
      id: 'soporte-proyecto',
      label: 'Proyecto (opcional)',
      options: [
        { value: '', label: 'Ninguno en particular' },
        ...projects.map((project) => ({ value: project.id, label: project.name })),
      ],
    },
  ];
}

const TICKET_EMPTY: Readonly<Record<TicketKey, string>> = {
  subject: '',
  description: '',
  category: 'support',
  priority: 'medium',
  project: '',
};

function ticketProblems(values: Readonly<Record<TicketKey, string>>): Record<string, string> {
  const found: Record<string, string> = {};
  if (values.subject.trim().length < 3) found['subject'] = 'Escriba un asunto corto.';
  if (values.description.trim().length < 10) {
    found['description'] = 'Cuéntenos con detalle qué pasa (al menos 10 letras).';
  }
  return found;
}

function ticketBody(values: Readonly<Record<TicketKey, string>>): object {
  return {
    subject: values.subject.trim(),
    description: values.description.trim(),
    category: values.category,
    priority: values.priority,
    project_id: values.project === '' ? null : values.project,
  };
}

/** Registra la solicitud y abre su ficha. */
function useTicketForm(close: () => void) {
  const api = useApiClient();
  const router = useRouter();
  const create = usePortalAction<object, string>(
    async (body, csrfToken) =>
      (await api.post('/v1/portal/tickets', { body, schema: createdResponseSchema, csrfToken })).id,
    (id) => {
      close();
      router.push(PORTAL_PATHS.ticket(id));
    },
  );
  const form = useDialogForm(TICKET_EMPTY, ticketProblems, (values) => {
    create.execute(ticketBody(values));
  });
  return { create, form };
}

function TicketForm({ close }: { readonly close: () => void }): JSX.Element {
  const { create, form } = useTicketForm(close);
  const choices = ticketChoices(usePortalProjects().data?.data ?? []);
  const change = (key: TicketKey, value: string): void => {
    form.set({ [key]: value });
  };
  return (
    <DialogForm
      problems={form.problems}
      fields={[...summaryOf(TICKET_TEXTS), ...summaryOf(choices)]}
      action={create}
      submitLabel="Enviar solicitud"
      onSubmit={form.submit}
    >
      <Fields
        specs={TICKET_TEXTS}
        values={form.values}
        problems={form.problems}
        onChange={change}
      />
      <ChoiceFields
        specs={choices}
        values={form.values}
        problems={form.problems}
        onChange={change}
      />
    </DialogForm>
  );
}

export function NewTicket(): JSX.Element {
  return (
    <RecordDialog
      triggerLabel="Pedir soporte"
      title="Pedir soporte"
      description="Le responderemos según la urgencia. Verá la respuesta aquí, en Soporte."
    >
      {(close) => <TicketForm close={close} />}
    </RecordDialog>
  );
}

type PqrsfKey = 'type' | 'subject' | 'description';

const PQRSF_TEXTS: readonly FieldSpec<PqrsfKey>[] = [
  { key: 'subject', field: 'subject', id: 'pqrsf-asunto', label: 'Asunto' },
  {
    key: 'description',
    field: 'description',
    id: 'pqrsf-descripcion',
    label: 'Cuéntenos',
    multiline: true,
  },
];

const PQRSF_CHOICES: readonly ChoiceSpec<PqrsfKey>[] = [
  { key: 'type', field: 'type', id: 'pqrsf-tipo', label: 'Tipo', options: optionsOf(PQRSF_TYPES) },
];

function pqrsfProblems(values: Readonly<Record<PqrsfKey, string>>): Record<string, string> {
  const found: Record<string, string> = {};
  if (values.subject.trim().length < 3) found['subject'] = 'Escriba un asunto corto.';
  if (values.description.trim().length < 10) {
    found['description'] = 'Cuéntenos con detalle (al menos 10 letras).';
  }
  return found;
}

interface Filed {
  readonly code: string;
  readonly due_on: string;
}

/** Lo que se radicó: el radicado y la fecha límite, como en el sitio público. */
function FiledNotice({ filed, close }: { readonly filed: Filed; readonly close: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <Alert tone="success">
        <AlertDescription>
          Radicamos su PQRSF {filed.code}. Le responderemos a más tardar el{' '}
          {formatDate(filed.due_on)}. El acuse llega a su correo.
        </AlertDescription>
      </Alert>
      <div>
        <Button type="button" variant="outline" onClick={close}>
          Listo
        </Button>
      </div>
    </div>
  );
}

/** Radica la PQRSF y guarda el radicado para mostrarlo. */
function usePqrsfForm() {
  const api = useApiClient();
  const [filed, setFiled] = useState<Filed | null>(null);
  const file = usePortalAction<object, Filed>(
    async (body, csrfToken) =>
      api.post('/v1/portal/pqrsf', { body, schema: portalPqrsfFiledSchema, csrfToken }),
    setFiled,
  );
  const form = useDialogForm(
    { type: 'petition', subject: '', description: '' },
    pqrsfProblems,
    (values) => {
      file.execute({
        type: values.type,
        subject: values.subject.trim(),
        description: values.description.trim(),
      });
    },
  );
  return { filed, file, form };
}

function PqrsfForm({ close }: { readonly close: () => void }): JSX.Element {
  const { filed, file, form } = usePqrsfForm();
  const change = (key: PqrsfKey, value: string): void => {
    form.set({ [key]: value });
  };
  if (filed !== null) return <FiledNotice filed={filed} close={close} />;
  return (
    <DialogForm
      problems={form.problems}
      fields={[...summaryOf(PQRSF_CHOICES), ...summaryOf(PQRSF_TEXTS)]}
      action={file}
      submitLabel="Radicar"
      onSubmit={form.submit}
    >
      <ChoiceFields
        specs={PQRSF_CHOICES}
        values={form.values}
        problems={form.problems}
        onChange={change}
      />
      <Fields specs={PQRSF_TEXTS} values={form.values} problems={form.problems} onChange={change} />
    </DialogForm>
  );
}

export function NewPqrsf(): JSX.Element {
  return (
    <RecordDialog
      triggerLabel="Radicar PQRSF"
      variant="outline"
      title="Radicar una PQRSF"
      description="Una petición, queja, reclamo, sugerencia o felicitación. El acuse con el radicado llega a su correo."
    >
      {(close) => <PqrsfForm close={close} />}
    </RecordDialog>
  );
}
