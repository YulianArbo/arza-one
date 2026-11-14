'use client';

import {
  NONCONFORMITY_TYPES,
  pqrsfTypeSchema,
  privacyKindSchema,
  type PqrsfDetail,
} from '@arza/contracts';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import type { AdminAction } from '../administration/admin-action';
import { optionsOf as crmOptionsOf } from '../crm/labels';
import { Choice, DialogForm, Fields, useDialogForm, type FieldSpec } from '../projects/form-bits';
import { usePqrsfOptions } from './care-queries';
import { PQRSF_TYPES, PRIVACY_KINDS } from './labels';
import { useServiceAction } from './queries';

// Formularios de los pasos de la PQRSF que piden datos (B29): clasificar, reasignar, redactar la
// respuesta y devolverla con su motivo.

interface StepProps {
  readonly pqrsf: PqrsfDetail;
  readonly onDone: () => void;
}

/** Un paso del recorrido con la versión que se vio de la PQRSF. */
export function usePqrsfStep(
  pqrsf: PqrsfDetail,
  action: string,
  onDone?: () => void,
): AdminAction<object, void> {
  const api = useApiClient();
  return useServiceAction<object>(async (body, csrfToken) => {
    await api.post(`/v1/pqrsf/${pqrsf.id}/actions/${action}`, {
      body,
      version: pqrsf.version,
      csrfToken,
    });
  }, onDone);
}

function useAssignees(): { value: string; label: string }[] {
  const people = usePqrsfOptions(true).data?.assignees ?? [];
  return [
    { value: '', label: 'Elija a quién' },
    ...people.map((p) => ({ value: p.id, label: p.name })),
  ];
}

const TYPE_OPTIONS = crmOptionsOf(pqrsfTypeSchema.options, PQRSF_TYPES);
const PRIVACY_OPTIONS = crmOptionsOf(
  privacyKindSchema.options,
  PRIVACY_KINDS,
  'No trata de datos personales',
);

interface ClassifyValues {
  readonly type: string;
  readonly privacy: string;
  readonly assignee: string;
}

const CLASSIFY_FIELDS = [
  { field: 'type', id: 'pqrsf-tipo-clase', label: 'Tipo' },
  { field: 'privacy_kind', id: 'pqrsf-datos', label: 'Datos personales' },
  { field: 'assignee_id', id: 'pqrsf-responsable', label: 'Responsable' },
];

function classifyProblems(values: ClassifyValues): Record<string, string> {
  return values.assignee === '' ? { assignee_id: 'Elija quién la tramita.' } : {};
}

function PrivacyChoice(props: {
  readonly value: string;
  readonly onValue: (value: string) => void;
}): JSX.Element {
  return (
    <Choice
      id="pqrsf-datos"
      label="¿Trata de datos personales?"
      hint="Si sí, toma el plazo de la Ley 1581 y se avisa al Oficial de protección de datos."
      options={PRIVACY_OPTIONS}
      value={props.value}
      onValue={props.onValue}
    />
  );
}

/** Clasificar: el formulario y su envío con el tercero que ya tenga. */
function useClassify(pqrsf: PqrsfDetail, onDone: () => void) {
  const step = usePqrsfStep(pqrsf, 'classify', onDone);
  const start: ClassifyValues = {
    type: pqrsf.type,
    privacy: pqrsf.privacy_kind ?? '',
    assignee: pqrsf.assignee?.id ?? '',
  };
  const form = useDialogForm(start, classifyProblems, (values) => {
    step.execute({
      type: values.type,
      privacy_kind: values.privacy === '' ? null : values.privacy,
      party_id: pqrsf.party?.id ?? null,
      assignee_id: values.assignee,
    });
  });
  return { step, form };
}

export function ClassifyForm({ pqrsf, onDone }: StepProps): JSX.Element {
  const assignees = useAssignees();
  const { step, form } = useClassify(pqrsf, onDone);
  return (
    <DialogForm
      problems={form.problems}
      fields={CLASSIFY_FIELDS}
      action={step}
      submitLabel="Clasificar"
      onSubmit={form.submit}
    >
      <Choice
        id="pqrsf-tipo-clase"
        label="Tipo"
        options={TYPE_OPTIONS}
        value={form.values.type}
        onValue={(value) => {
          form.set({ type: value });
        }}
      />
      <PrivacyChoice
        value={form.values.privacy}
        onValue={(privacy) => {
          form.set({ privacy });
        }}
      />
      <Choice
        id="pqrsf-responsable"
        label="Responsable"
        options={assignees}
        value={form.values.assignee}
        error={form.problems['assignee_id']}
        onValue={(value) => {
          form.set({ assignee: value });
        }}
      />
    </DialogForm>
  );
}

export function AssignPqrsfForm({ pqrsf, onDone }: StepProps): JSX.Element {
  const assignees = useAssignees();
  const step = usePqrsfStep(pqrsf, 'assign', onDone);
  const fields = [{ field: 'assignee_id', id: 'pqrsf-reasignar', label: 'Responsable' }];
  const form = useDialogForm(
    { assignee: '' },
    (values) => (values.assignee === '' ? { assignee_id: 'Elija a quién.' } : {}),
    (values) => {
      step.execute({ assignee_id: values.assignee });
    },
  );
  return (
    <DialogForm
      problems={form.problems}
      fields={fields}
      action={step}
      submitLabel="Reasignar"
      onSubmit={form.submit}
    >
      <Choice
        id="pqrsf-reasignar"
        label="Responsable"
        options={assignees}
        value={form.values.assignee}
        error={form.problems['assignee_id']}
        onValue={(value) => {
          form.set({ assignee: value });
        }}
      />
    </DialogForm>
  );
}

const FOUNDED_OPTIONS = [
  { value: '', label: 'Elija una opción' },
  { value: 'true', label: 'Sí, es procedente: se pide la no conformidad a Calidad' },
  { value: 'false', label: 'No es procedente' },
];

const RESPONSE: readonly FieldSpec<'response'>[] = [
  {
    key: 'response',
    field: 'response',
    id: 'pqrsf-respuesta',
    label: 'Respuesta para quien la presentó',
    hint: 'Se envía por correo cuando otra persona la apruebe.',
    multiline: true,
  },
];

interface DraftValues {
  readonly response: string;
  readonly founded: string;
}

function draftProblems(asksFounded: boolean) {
  return (values: DraftValues): Record<string, string> => {
    const found: Record<string, string> = {};
    if (values.response.trim().length < 10)
      found['response'] = 'Escriba la respuesta (al menos 10 letras).';
    if (asksFounded && values.founded === '') found['well_founded'] = 'Indique si es procedente.';
    return found;
  };
}

const DRAFT_FIELDS = [
  ...RESPONSE,
  { field: 'well_founded', id: 'pqrsf-procedente', label: '¿Es procedente?' },
];

/** Redactar: el borrador que ya hay y, en una queja o un reclamo, si es procedente. */
function useDraft(pqrsf: PqrsfDetail, onDone: () => void) {
  const asksFounded = NONCONFORMITY_TYPES.includes(pqrsf.type);
  const step = usePqrsfStep(pqrsf, 'draft', onDone);
  const start: DraftValues = {
    response: pqrsf.response_draft ?? '',
    founded: pqrsf.well_founded === null ? '' : String(pqrsf.well_founded),
  };
  const form = useDialogForm(start, draftProblems(asksFounded), (values) => {
    step.execute({
      response: values.response.trim(),
      well_founded: asksFounded ? values.founded === 'true' : null,
    });
  });
  return { asksFounded, step, form };
}

export function DraftForm({ pqrsf, onDone }: StepProps): JSX.Element {
  const { asksFounded, step, form } = useDraft(pqrsf, onDone);
  return (
    <DialogForm
      problems={form.problems}
      fields={DRAFT_FIELDS}
      action={step}
      submitLabel="Guardar la respuesta"
      onSubmit={form.submit}
    >
      <Fields
        specs={RESPONSE}
        values={form.values}
        problems={form.problems}
        onChange={(_key, response) => {
          form.set({ response });
        }}
      />
      {asksFounded ? (
        <Choice
          id="pqrsf-procedente"
          label="¿La queja o el reclamo es procedente?"
          options={FOUNDED_OPTIONS}
          value={form.values.founded}
          error={form.problems['well_founded']}
          onValue={(founded) => {
            form.set({ founded });
          }}
        />
      ) : null}
    </DialogForm>
  );
}

const REASON: readonly FieldSpec<'reason'>[] = [
  {
    key: 'reason',
    field: 'reason',
    id: 'pqrsf-motivo',
    label: 'Qué hay que corregir',
    multiline: true,
  },
];

export function ReturnForm({ pqrsf, onDone }: StepProps): JSX.Element {
  const step = usePqrsfStep(pqrsf, 'return', onDone);
  const form = useDialogForm(
    { reason: '' },
    (values) =>
      values.reason.trim().length < 3 ? { reason: 'Escriba qué hay que corregir.' } : {},
    (values) => {
      step.execute({ reason: values.reason.trim() });
    },
  );
  return (
    <DialogForm
      problems={form.problems}
      fields={REASON}
      action={step}
      submitLabel="Devolver"
      onSubmit={form.submit}
    >
      <Fields
        specs={REASON}
        values={form.values}
        problems={form.problems}
        onChange={(_key, reason) => {
          form.set({ reason });
        }}
      />
    </DialogForm>
  );
}
