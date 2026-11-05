'use client';

import { createdResponseSchema, type ContractOptions } from '@arza/contracts';
import { Card, CardContent, CardHeader, CardTitle, FormField, SelectField } from '@arza/ui';
import { useRouter } from 'next/navigation';
import { useState, type JSX, type ReactNode, type SubmitEvent } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { FormSummary, type SummaryField } from '../../components/form-summary';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { useParties } from '../parties/queries';
import { DATA_FIELDS, ContractDataFields } from './contract-fields';
import {
  createBody,
  createProblems,
  valuesFromQuote,
  type ContractValues,
} from './contract-form-values';
import { CONTRACT_PATHS } from './labels';
import { useContractAction, useContractOptions } from './queries';

// Asistente de contrato desde plantilla (B24, numeral 16.3): la plantilla y el cliente (o la
// cotización aceptada, que los trae), y los datos con que se llenan las variables. Al generarlo, el
// texto es idéntico al modelo salvo las variables; las cláusulas se revisan en la edición.

const SUMMARY: readonly SummaryField[] = [
  { field: 'template_id', id: 'contrato-plantilla', label: 'Plantilla' },
  { field: 'party_id', id: 'contrato-cliente', label: 'Cliente' },
  ...DATA_FIELDS,
];

type Patch = (patch: Partial<ContractValues>) => void;

function ClientPicker(props: {
  readonly partyId: string;
  readonly error: string | undefined;
  readonly onChange: (partyId: string) => void;
}): JSX.Element {
  const [search, setSearch] = useState('');
  const parties = useParties({ q: search, role: '', status: '' }, null).data?.data ?? [];
  const options = [
    { value: '', label: parties.length === 0 ? 'Sin resultados' : 'Elija el cliente' },
    ...parties.map((party) => ({ value: party.id, label: party.name })),
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField
        id="contrato-buscar-cliente"
        label="Buscar el cliente en Terceros"
        type="search"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          props.onChange('');
        }}
      />
      <SelectField
        id="contrato-cliente"
        label="Cliente"
        options={options}
        value={props.partyId}
        error={props.error}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
      />
    </div>
  );
}

function TemplateSelect(props: {
  readonly templates: ContractOptions['templates'];
  readonly value: string;
  readonly error: string | undefined;
  readonly set: Patch;
}): JSX.Element {
  const options = [
    { value: '', label: 'Elija la plantilla' },
    ...props.templates.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` })),
  ];
  return (
    <SelectField
      id="contrato-plantilla"
      label="Plantilla"
      options={options}
      value={props.value}
      error={props.error}
      onChange={(event) => {
        props.set({ templateId: event.target.value });
      }}
    />
  );
}

function QuoteNote({ quote }: { readonly quote: NonNullable<ContractOptions['quote']> }) {
  return (
    <p className="text-sm">
      Desde la cotización aceptada <strong>{quote.code}</strong> de{' '}
      <strong>{quote.party.name}</strong>: el cliente, el valor y lo cotizado ya están llenos.
    </p>
  );
}

function Step(props: { readonly title: string; readonly children: ReactNode }): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{props.children}</CardContent>
    </Card>
  );
}

function SourceStep(props: {
  readonly options: ContractOptions;
  readonly values: ContractValues;
  readonly problems: Readonly<Record<string, string>>;
  readonly set: Patch;
}): JSX.Element {
  const { options, values, problems, set } = props;
  return (
    <Step title="1. Plantilla y cliente">
      <TemplateSelect
        templates={options.templates}
        value={values.templateId}
        error={problems['template_id']}
        set={set}
      />
      {options.quote === null ? (
        <ClientPicker
          partyId={values.partyId}
          error={problems['party_id']}
          onChange={(partyId) => {
            set({ partyId });
          }}
        />
      ) : (
        <QuoteNote quote={options.quote} />
      )}
    </Step>
  );
}

function useWizard(options: ContractOptions) {
  const api = useApiClient();
  const router = useRouter();
  const [values, setValues] = useState(() => valuesFromQuote(options.quote));
  const [problems, setProblems] = useState<Record<string, string>>({});
  const signers = useContractOptions({ party_id: values.partyId || null }).data?.signers ?? [];
  const create = useContractAction<object, string>(
    async (body, csrfToken) =>
      (await api.post('/v1/contracts', { body, schema: createdResponseSchema, csrfToken })).id,
    (id) => {
      router.push(CONTRACT_PATHS.contract(id));
    },
  );
  const set: Patch = (patch) => {
    setValues({ ...values, ...patch });
  };
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = createProblems(values);
    setProblems(found);
    if (Object.keys(found).length === 0) create.execute(createBody(values));
  };
  return { values, problems, signers, create, set, submit };
}

function Wizard({ options }: { readonly options: ContractOptions }): JSX.Element {
  const { values, problems, signers, create, set, submit } = useWizard(options);
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <FormSummary problems={problems} fields={SUMMARY} />
      {create.error === null ? null : <FormError error={create.error} />}
      <SourceStep options={options} values={values} problems={problems} set={set} />
      <Step title="2. Datos del contrato">
        <ContractDataFields values={values} problems={problems} signers={signers} set={set} />
      </Step>
      <p className="text-sm text-muted-foreground">
        3. Al generarlo verá el texto completo, cláusula por cláusula. Si cambia alguna, la
        Dirección deberá revisarla antes de aprobar.
      </p>
      <div>
        <SubmitButton
          label="Generar el contrato"
          pendingLabel="Generando…"
          pending={create.pending}
        />
      </div>
      {create.dialog}
    </form>
  );
}

/** Contrato nuevo: en blanco o desde una cotización aceptada (aviso «Crear el contrato»). */
export function NewContract({ quoteId }: { readonly quoteId: string | null }): JSX.Element {
  const options = useContractOptions({ quote_id: quoteId });
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Nuevo contrato"
        description="Elija la plantilla y el cliente y escriba los datos con que se llenará el modelo."
      />
      <QueryState query={options} loadingLabel="Cargando las plantillas">
        {(data) => <Wizard options={data} />}
      </QueryState>
    </div>
  );
}
