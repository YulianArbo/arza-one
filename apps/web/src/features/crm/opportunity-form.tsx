'use client';

import { createdResponseSchema, createOpportunityRequestSchema } from '@arza/contracts';
import { Button, FormField, SelectField } from '@arza/ui';
import { useRouter } from 'next/navigation';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useParties } from '../parties/queries';
import { useCrmAction } from './crm-action';
import { CRM_PATHS } from './labels';
import { TextFields, type TextFieldSpec } from './text-fields';

// Registrar una oportunidad (B22, ficha 17.6) para un cliente que ya está en Terceros. Nace en
// Prospección con la probabilidad de la etapa.

interface OpportunityValues {
  readonly search: string;
  readonly partyId: string;
  readonly title: string;
  readonly value: string;
  readonly expectedClose: string;
}

const EMPTY: OpportunityValues = {
  search: '',
  partyId: '',
  title: '',
  value: '',
  expectedClose: '',
};

function bodyOf(values: OpportunityValues) {
  return {
    party_id: values.partyId,
    title: values.title.trim(),
    estimated_value: values.value.trim(),
    expected_close: values.expectedClose,
  };
}

const MESSAGES: Readonly<Record<string, string>> = {
  party_id: 'Busque y elija el cliente.',
  title: 'Escriba al menos tres letras.',
  estimated_value: 'Escriba el valor en pesos, sin puntos de miles: 1500000.50',
  expected_close: 'Elija la fecha esperada de cierre.',
};

/** Problemas por campo, con el mismo esquema que usa la API. */
export function opportunityProblems(values: OpportunityValues): Record<string, string> {
  const result = createOpportunityRequestSchema.safeParse(bodyOf(values));
  if (result.success) return {};
  const problems: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '');
    problems[field] ??= MESSAGES[field] ?? 'Revise este dato.';
  }
  return problems;
}

function ClientPicker(props: {
  readonly values: OpportunityValues;
  readonly error: string | undefined;
  readonly onChange: (values: OpportunityValues) => void;
}): JSX.Element {
  const { values } = props;
  const parties = useParties({ q: values.search, role: '', status: '' }, null).data?.data ?? [];
  const options = [
    { value: '', label: parties.length === 0 ? 'Sin resultados' : 'Elija el cliente' },
    ...parties.map((party) => ({ value: party.id, label: party.name })),
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField
        id="oportunidad-buscar-cliente"
        label="Buscar el cliente en Terceros"
        type="search"
        value={values.search}
        onChange={(event) => {
          props.onChange({ ...values, search: event.target.value, partyId: '' });
        }}
      />
      <SelectField
        id="oportunidad-cliente"
        label="Cliente"
        options={options}
        value={values.partyId}
        error={props.error}
        onChange={(event) => {
          props.onChange({ ...values, partyId: event.target.value });
        }}
      />
    </div>
  );
}

const FIELDS: readonly TextFieldSpec<'title' | 'value' | 'expectedClose'>[] = [
  { key: 'title', field: 'title', id: 'oportunidad-titulo', label: 'Título' },
  {
    key: 'value',
    field: 'estimated_value',
    id: 'oportunidad-valor',
    label: 'Valor estimado (pesos)',
    decimal: true,
  },
  {
    key: 'expectedClose',
    field: 'expected_close',
    id: 'oportunidad-cierre',
    label: 'Fecha esperada de cierre',
    type: 'date',
  },
];

function useSaveOpportunity() {
  const api = useApiClient();
  const router = useRouter();
  return useCrmAction<OpportunityValues, string>(
    async (current, csrfToken) => {
      const options = { body: bodyOf(current), schema: createdResponseSchema, csrfToken };
      return (await api.post('/v1/crm/opportunities', options)).id;
    },
    (id) => {
      router.push(CRM_PATHS.opportunity(id));
    },
  );
}

function useOpportunityForm() {
  const [values, setValues] = useState(EMPTY);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const save = useSaveOpportunity();
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = opportunityProblems(values);
    setProblems(found);
    if (Object.keys(found).length === 0) save.execute(values);
  };
  return { values, setValues, problems, save, submit };
}

function FormButtons({ pending }: { readonly pending: boolean }): JSX.Element {
  const router = useRouter();
  return (
    <div className="flex gap-2">
      <SubmitButton label="Registrar oportunidad" pendingLabel="Registrando…" pending={pending} />
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          router.back();
        }}
      >
        Cancelar
      </Button>
    </div>
  );
}

export function OpportunityForm(): JSX.Element {
  const form = useOpportunityForm();
  return (
    <form noValidate onSubmit={form.submit} className="flex max-w-3xl flex-col gap-4">
      {form.save.error === null ? null : <FormError error={form.save.error} />}
      <ClientPicker
        values={form.values}
        error={form.problems['party_id']}
        onChange={form.setValues}
      />
      <TextFields
        specs={FIELDS}
        values={form.values}
        problems={form.problems}
        onChange={(key, text) => {
          form.setValues({ ...form.values, [key]: text });
        }}
      />
      <FormButtons pending={form.save.pending} />
      {form.save.dialog}
    </form>
  );
}
