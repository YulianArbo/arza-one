'use client';

import { createdResponseSchema, type ProjectOptions } from '@arza/contracts';
import {
  Alert,
  AlertDescription,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  SelectField,
} from '@arza/ui';
import { useRouter } from 'next/navigation';
import { useState, type JSX, type ReactNode, type SubmitEvent } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { FormSummary, type SummaryField } from '../../components/form-summary';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { formatPesos } from '../crm/labels';
import { useParties } from '../parties/queries';
import { DATA_FIELDS, ProjectDataFields } from './project-fields';
import {
  EMPTY_VALUES,
  createBody,
  createProblems,
  valuesFromContract,
  type ProjectValues,
} from './project-form-values';
import { PROJECT_PATHS } from './labels';
import { useProjectAction, useProjectOptions } from './queries';

// Asistente de proyecto (B26, numeral 16.3): el contrato vigente de origen (que trae el cliente,
// las fechas y el valor) o, sin contrato, el cliente de Terceros; y los datos del proyecto. Sin
// contrato vigente el proyecto se planea, pero se inicia solo con la autorización de la Dirección.

const SUMMARY: readonly SummaryField[] = [
  { field: 'contract_id', id: 'proyecto-contrato', label: 'Contrato' },
  { field: 'party_id', id: 'proyecto-cliente', label: 'Cliente' },
  ...DATA_FIELDS,
];

type Patch = (patch: Partial<ProjectValues>) => void;

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
        id="proyecto-buscar-cliente"
        label="Buscar el cliente en Terceros"
        type="search"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          props.onChange('');
        }}
      />
      <SelectField
        id="proyecto-cliente"
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

/** Sin contrato: el aviso de la autorización y el cliente de Terceros. */
function WithoutContract(props: {
  readonly partyId: string;
  readonly error: string | undefined;
  readonly set: Patch;
}): JSX.Element {
  return (
    <>
      <Alert tone="warning">
        <AlertDescription>
          Sin contrato vigente podrá planear el proyecto, pero para iniciarlo deberá pedir la
          autorización de la Dirección.
        </AlertDescription>
      </Alert>
      <ClientPicker
        partyId={props.partyId}
        error={props.error}
        onChange={(partyId) => {
          props.set({ partyId });
        }}
      />
    </>
  );
}

function OriginStep(props: {
  readonly options: ProjectOptions;
  readonly values: ProjectValues;
  readonly problems: Readonly<Record<string, string>>;
  readonly onContract: (contractId: string) => void;
  readonly set: Patch;
}): JSX.Element {
  const choices = [
    { value: '', label: 'Sin contrato vigente (la Dirección autorizará el inicio)' },
    ...props.options.contracts.map((contract) => ({
      value: contract.id,
      label: `${contract.code} · ${contract.title} · ${contract.party.name} · ${formatPesos(contract.value)}`,
    })),
  ];
  return (
    <Step title="1. Origen del proyecto">
      <SelectField
        id="proyecto-contrato"
        label="Contrato vigente"
        hint="Solo aparecen los contratos vigentes que todavía no tienen proyecto."
        options={choices}
        value={props.values.contractId}
        error={props.problems['contract_id']}
        onChange={(event) => {
          props.onContract(event.target.value);
        }}
      />
      {props.values.contractId === '' ? (
        <WithoutContract
          partyId={props.values.partyId}
          error={props.problems['party_id']}
          set={props.set}
        />
      ) : null}
    </Step>
  );
}

function useWizard(options: ProjectOptions, contractId: string | null) {
  const api = useApiClient();
  const router = useRouter();
  const contractOf = (id: string) => options.contracts.find((contract) => contract.id === id);
  const [values, setValues] = useState(() =>
    valuesFromContract(EMPTY_VALUES, contractOf(contractId ?? '')),
  );
  const [problems, setProblems] = useState<Record<string, string>>({});
  const create = useProjectAction<object, string>(
    async (body, csrfToken) =>
      (await api.post('/v1/projects', { body, schema: createdResponseSchema, csrfToken })).id,
    (id) => {
      router.push(PROJECT_PATHS.project(id));
    },
  );
  const set: Patch = (patch) => {
    setValues({ ...values, ...patch });
  };
  const onContract = (id: string): void => {
    setValues(valuesFromContract(values, contractOf(id)));
  };
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = createProblems(values);
    setProblems(found);
    if (Object.keys(found).length === 0) create.execute(createBody(values));
  };
  return { values, problems, create, set, onContract, submit };
}

function Wizard(props: {
  readonly options: ProjectOptions;
  readonly contractId: string | null;
}): JSX.Element {
  const { values, problems, create, set, onContract, submit } = useWizard(
    props.options,
    props.contractId,
  );
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <FormSummary problems={problems} fields={SUMMARY} />
      {create.error === null ? null : <FormError error={create.error} />}
      <OriginStep
        options={props.options}
        values={values}
        problems={problems}
        onContract={onContract}
        set={set}
      />
      <Step title="2. Datos del proyecto">
        <ProjectDataFields
          values={values}
          problems={problems}
          people={props.options.people}
          set={set}
        />
      </Step>
      <div>
        <SubmitButton label="Crear el proyecto" pendingLabel="Creando…" pending={create.pending} />
      </div>
      {create.dialog}
    </form>
  );
}

/** Proyecto nuevo: desde un contrato vigente (lista «Contratos vigentes sin proyecto») o sin él. */
export function NewProject({ contractId }: { readonly contractId: string | null }): JSX.Element {
  const options = useProjectOptions();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Nuevo proyecto"
        description="Elija el contrato vigente de origen y escriba los datos del proyecto."
      />
      <QueryState query={options} loadingLabel="Cargando los contratos vigentes">
        {(data) => <Wizard options={data} contractId={contractId} />}
      </QueryState>
    </div>
  );
}
