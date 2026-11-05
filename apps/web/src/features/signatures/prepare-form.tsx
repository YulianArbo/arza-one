'use client';

import type { EnvelopeOptions } from '@arza/contracts';
import {
  Alert,
  AlertDescription,
  Checkbox,
  DialogFooter,
  FormField,
  LoadingState,
  SelectField,
  TextareaField,
} from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { FormSummary, type SummaryField } from '../../components/form-summary';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useContractAction } from '../contracts/queries';
import { useEnvelopeOptions, type SignatureTarget } from './queries';

// Preparar el envío a firma (B25, decisiones 3 a 8): quiénes firman por el cliente (solo sus
// firmantes autorizados, con correo y documento), en el orden en que se marcan, quién firma de último
// por la empresa (la Dirección) y hasta cuándo. Queda «en preparación» hasta que la Dirección lo envía.

const FIELDS: readonly SummaryField[] = [
  { field: 'client_signer_ids', id: 'firma-cliente-0', label: 'Firman por el cliente' },
  { field: 'company_signer_id', id: 'firma-empresa', label: 'Firma por la empresa' },
  { field: 'expires_on', id: 'firma-plazo', label: 'Último día para firmar' },
];

interface Choices {
  readonly clients: readonly string[];
  readonly company: string;
  readonly expiresOn: string;
  readonly message: string;
}

function problemsOf(choices: Choices, options: EnvelopeOptions): Record<string, string> {
  const problems: Record<string, string> = {};
  if (choices.clients.length === 0) problems['client_signer_ids'] = 'Marque al menos una persona.';
  if (choices.company === '') problems['company_signer_id'] = 'Elija quién firma por la empresa.';
  if (choices.expiresOn === '' || choices.expiresOn > options.max_expires_on) {
    problems['expires_on'] = 'Elija una fecha de hoy a 30 días.';
  }
  return problems;
}

type SignerChoice = EnvelopeOptions['client_signers'][number];

function SignerOption(props: {
  readonly signer: SignerChoice;
  readonly index: number;
  /** Su turno entre los marcados, desde 0; -1 si no está marcado. */
  readonly turn: number;
  readonly onToggle: (personId: string) => void;
}): JSX.Element {
  const { signer, turn } = props;
  const id = `firma-cliente-${String(props.index)}`;
  return (
    <label htmlFor={id} className="flex items-start gap-2 text-sm">
      <Checkbox
        id={id}
        className="mt-0.5"
        disabled={!signer.ready}
        checked={turn >= 0}
        onChange={() => {
          props.onToggle(signer.person_id ?? '');
        }}
      />
      <span>
        {signer.name} · {signer.id_number ?? 'sin documento'} · {signer.email ?? 'sin correo'}
        {turn >= 0 ? ` — firma de ${String(turn + 1)}.º` : ''}
        {signer.ready ? '' : ' (complete su correo y su documento en Terceros)'}
      </span>
    </label>
  );
}

function ClientSigners(props: {
  readonly options: EnvelopeOptions;
  readonly chosen: readonly string[];
  readonly onToggle: (personId: string) => void;
}): JSX.Element {
  const { options, chosen } = props;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">
        Firman por {options.party.name}, en el orden en que los marque
      </legend>
      {options.client_signers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {options.party.name} no tiene firmantes autorizados en Terceros.
        </p>
      ) : null}
      {options.client_signers.map((signer, index) => (
        <SignerOption
          key={signer.person_id ?? String(index)}
          signer={signer}
          index={index}
          turn={chosen.indexOf(signer.person_id ?? '')}
          onToggle={props.onToggle}
        />
      ))}
    </fieldset>
  );
}

function companyOptions(options: EnvelopeOptions) {
  const ready = options.company_signers.filter((signer) => signer.ready);
  return [
    { value: '', label: ready.length === 0 ? 'Nadie de la Dirección está listo' : 'Elija' },
    ...ready.map((signer) => ({ value: signer.user_id, label: signer.name })),
  ];
}

function useChoices(options: EnvelopeOptions) {
  const [clients, setClients] = useState<string[]>([]);
  const [company, setCompany] = useState('');
  const [expiresOn, setExpiresOn] = useState(options.default_expires_on);
  const [message, setMessage] = useState('');
  const toggle = (personId: string): void => {
    setClients((current) =>
      current.includes(personId) ? current.filter((id) => id !== personId) : [...current, personId],
    );
  };
  return {
    choices: { clients, company, expiresOn, message },
    toggle,
    setCompany,
    setExpiresOn,
    setMessage,
  };
}

type Choosing = ReturnType<typeof useChoices>;

/** Quien firma por la empresa, de último: una persona de la Dirección lista para firmar. */
function CompanyField(props: {
  readonly form: Choosing;
  readonly options: EnvelopeOptions;
  readonly problem: string | undefined;
}): JSX.Element {
  const { form } = props;
  return (
    <SelectField
      id="firma-empresa"
      label="Firma por la empresa, de último"
      hint="Firma desde esta ficha, con su contraseña y su segundo factor."
      options={companyOptions(props.options)}
      value={form.choices.company}
      error={props.problem}
      onChange={(event) => {
        form.setCompany(event.target.value);
      }}
    />
  );
}

/** Quién firma por la empresa, hasta cuándo y el mensaje. */
function EnvelopeFields(props: {
  readonly form: Choosing;
  readonly options: EnvelopeOptions;
  readonly problems: Readonly<Record<string, string>>;
}): JSX.Element {
  const { form, problems } = props;
  return (
    <>
      <CompanyField form={form} options={props.options} problem={problems['company_signer_id']} />
      <FormField
        id="firma-plazo"
        label="Último día para firmar"
        type="date"
        max={props.options.max_expires_on}
        value={form.choices.expiresOn}
        error={problems['expires_on'] ?? null}
        onChange={(event) => {
          form.setExpiresOn(event.target.value);
        }}
      />
      <TextareaField
        id="firma-mensaje"
        label="Mensaje para quienes firman (opcional)"
        value={form.choices.message}
        onChange={(event) => {
          form.setMessage(event.target.value);
        }}
      />
    </>
  );
}

function bodyOf(target: SignatureTarget, choices: Choices): object {
  return {
    source: target.source,
    source_id: target.id,
    client_signer_ids: choices.clients,
    company_signer_id: choices.company,
    expires_on: choices.expiresOn,
    message: choices.message.trim() === '' ? null : choices.message.trim(),
  };
}

function Form(props: {
  readonly target: SignatureTarget;
  readonly options: EnvelopeOptions;
  readonly onDone: () => void;
}): JSX.Element {
  const api = useApiClient();
  const form = useChoices(props.options);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const create = useContractAction<object>(
    (body, csrfToken) => api.post('/v1/signature-envelopes', { body, csrfToken }),
    props.onDone,
  );
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = problemsOf(form.choices, props.options);
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    create.execute(bodyOf(props.target, form.choices));
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {create.error === null ? null : <FormError error={create.error} />}
      <FormSummary problems={problems} fields={FIELDS} />
      <ClientSigners options={props.options} chosen={form.choices.clients} onToggle={form.toggle} />
      {problems['client_signer_ids'] === undefined ? null : (
        <p className="text-sm text-destructive">{problems['client_signer_ids']}</p>
      )}
      <EnvelopeFields form={form} options={props.options} problems={problems} />
      <DialogFooter>
        <SubmitButton
          label="Preparar el envío"
          pendingLabel="Preparando…"
          pending={create.pending}
        />
      </DialogFooter>
      {create.dialog}
    </form>
  );
}

/** El formulario, cuando ya se sabe quién puede firmar; o por qué todavía no se puede. */
export function PrepareSignatureForm(props: {
  readonly target: SignatureTarget;
  readonly onDone: () => void;
}): JSX.Element {
  const options = useEnvelopeOptions(props.target);
  if (options.isPending) return <LoadingState label="Buscando los firmantes" />;
  if (options.isError) return <FormError error={options.error} />;
  if (!options.data.party_verified) {
    return (
      <Alert tone="warning">
        <AlertDescription>
          Antes de enviar a firma, el conocimiento de {options.data.party.name} (FT-COM-003) debe
          estar aprobado en Terceros: así se verifican el correo y el documento de quienes firman.
        </AlertDescription>
      </Alert>
    );
  }
  return <Form target={props.target} options={options.data} onDone={props.onDone} />;
}
