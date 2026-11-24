'use client';

import { IDENTITY_METHODS, type PrivacyRequest } from '@arza/contracts';
import { SelectField } from '@arza/ui';
import { useState, type JSX } from 'react';

import { FormError } from '../access/form-alert';
import { bogotaToday } from '../crm/labels';
import { useParties } from '../parties/queries';
import {
  Choice,
  DialogForm,
  Fields,
  optionsOf,
  TextInput,
  useDialogForm,
  type FieldSpec,
} from '../projects/form-bits';
import { useRequestStep } from './request-queries';

// Formularios de los pasos de la solicitud que piden datos (B42): verificar la identidad, pedir que
// complete el reclamo, registrar lo que completó, ampliar el plazo y responder.

interface StepProps {
  readonly request: PrivacyRequest;
  readonly onDone: () => void;
}

type Problems = Record<string, string>;

function minLength(value: string, min: number, field: string, message: string): Problems {
  return value.trim().length < min ? { [field]: message } : {};
}

function PartyChoice(props: {
  readonly initial: string;
  readonly value: string;
  readonly error: string | undefined;
  readonly onValue: (id: string) => void;
}): JSX.Element {
  const [search, setSearch] = useState(props.initial);
  const parties = useParties({ q: search, role: '', status: '' }, null);
  const options = (parties.data?.data ?? []).map((party) => ({
    value: party.id,
    label: party.name,
  }));
  return (
    <div className="flex flex-col gap-3">
      <TextInput
        id="verificar-buscar"
        label="Buscar al titular en Terceros"
        hint="Por nombre o número de documento."
        value={search}
        onValue={setSearch}
      />
      {parties.isError ? <FormError error={parties.error} /> : null}
      <SelectField
        id="verificar-titular"
        label="Titular"
        value={props.value}
        error={props.error}
        options={[{ value: '', label: 'Elija a la persona' }, ...options]}
        onChange={(event) => {
          props.onValue(event.target.value);
        }}
      />
    </div>
  );
}

const VERIFY_SUMMARY = [
  { field: 'party_id', id: 'verificar-titular', label: 'Titular' },
  { field: 'method', id: 'verificar-metodo', label: 'Cómo lo comprobó' },
  { field: 'note', id: 'verificar-nota', label: 'Qué revisó' },
];

interface VerifyValues {
  readonly party: string;
  readonly method: string;
  readonly note: string;
}

function verifyProblems(values: VerifyValues): Problems {
  return {
    ...(values.party === '' ? { party_id: 'Elija a la persona registrada en Terceros.' } : {}),
    ...minLength(values.note, 5, 'note', 'Cuente qué revisó (al menos cinco letras).'),
  };
}

function verifyStart(request: PrivacyRequest): VerifyValues {
  const method = request.channel === 'portal' ? 'portal_session' : 'document';
  return { party: request.party?.id ?? '', method, note: '' };
}

export function VerifyForm({ request, onDone }: StepProps): JSX.Element {
  const step = useRequestStep(request, 'verify', onDone);
  const form = useDialogForm(verifyStart(request), verifyProblems, (values) => {
    step.execute({ party_id: values.party, method: values.method, note: values.note.trim() });
  });
  return (
    <DialogForm
      problems={form.problems}
      fields={VERIFY_SUMMARY}
      action={step}
      submitLabel="Verificar"
      onSubmit={form.submit}
    >
      <PartyChoice
        initial={request.document_number ?? request.requester_name}
        value={form.values.party}
        error={form.problems['party_id']}
        onValue={(party) => {
          form.set({ party });
        }}
      />
      <VerifyDetails values={form.values} problems={form.problems} onSet={form.set} />
    </DialogForm>
  );
}

function VerifyDetails(props: {
  readonly values: VerifyValues;
  readonly problems: Readonly<Problems>;
  readonly onSet: (patch: Partial<VerifyValues>) => void;
}): JSX.Element {
  return (
    <>
      <Choice
        id="verificar-metodo"
        label="Cómo lo comprobó"
        options={optionsOf(IDENTITY_METHODS)}
        value={props.values.method}
        onValue={(method) => {
          props.onSet({ method });
        }}
      />
      <TextInput
        id="verificar-nota"
        label="Qué revisó"
        value={props.values.note}
        error={props.problems['note']}
        onValue={(note) => {
          props.onSet({ note });
        }}
      />
    </>
  );
}

/** Un formulario de un solo texto con su mínimo de letras. */
function OneTextForm(
  props: StepProps & {
    readonly action: string;
    readonly field: string;
    readonly spec: FieldSpec<'text'>;
    readonly min: number;
    readonly submitLabel: string;
    readonly extra?: (text: string) => object;
  },
): JSX.Element {
  const step = useRequestStep(props.request, props.action, props.onDone);
  const message = `Escriba al menos ${String(props.min)} letras.`;
  const form = useDialogForm(
    { text: '' },
    (values) => minLength(values.text, props.min, props.field, message),
    (values) => {
      step.execute({ [props.field]: values.text.trim(), ...(props.extra?.(values.text) ?? {}) });
    },
  );
  return (
    <DialogForm
      problems={form.problems}
      fields={[props.spec]}
      action={step}
      submitLabel={props.submitLabel}
      onSubmit={form.submit}
    >
      <Fields
        specs={[props.spec]}
        values={form.values}
        problems={form.problems}
        onChange={(_key, text) => {
          form.set({ text });
        }}
      />
    </DialogForm>
  );
}

export function RequireForm(props: StepProps): JSX.Element {
  const spec = {
    key: 'text',
    field: 'text',
    id: 'requerir-texto',
    label: 'Qué le falta al reclamo',
    hint: 'Se le envía al titular; el plazo queda suspendido hasta que responda.',
    multiline: true,
  } as const;
  return (
    <OneTextForm
      {...props}
      action="require"
      field="text"
      spec={spec}
      min={5}
      submitLabel="Enviar al titular"
    />
  );
}

export function AnswerRequirementForm(props: StepProps): JSX.Element {
  const spec = {
    key: 'text',
    field: 'note',
    id: 'completo-nota',
    label: 'Qué entregó el titular',
    hint: 'Se registra con la fecha de hoy y el plazo vuelve a correr.',
    multiline: true,
  } as const;
  return (
    <OneTextForm
      {...props}
      action="answer-requirement"
      field="note"
      spec={spec}
      min={5}
      submitLabel="Registrar"
      extra={() => ({ answered_on: bogotaToday() })}
    />
  );
}

export function ExtendForm(props: StepProps): JSX.Element {
  const days = props.request.kind === 'inquiry' ? 5 : 8;
  const spec = {
    key: 'text',
    field: 'reason',
    id: 'prorroga-motivo',
    label: 'Por qué necesita más tiempo',
    hint: `Suma ${String(days)} días hábiles, una sola vez. Se le informa al titular.`,
    multiline: true,
  } as const;
  return (
    <OneTextForm
      {...props}
      action="extend"
      field="reason"
      spec={spec}
      min={5}
      submitLabel="Ampliar el plazo"
    />
  );
}

export function RespondForm(props: StepProps): JSX.Element {
  const spec = {
    key: 'text',
    field: 'response',
    id: 'responder-texto',
    label: 'Respuesta al titular',
    hint: 'Le llega por correo y la ve al consultar su solicitud.',
    multiline: true,
  } as const;
  return (
    <OneTextForm
      {...props}
      action="respond"
      field="response"
      spec={spec}
      min={20}
      submitLabel="Enviar la respuesta"
    />
  );
}
