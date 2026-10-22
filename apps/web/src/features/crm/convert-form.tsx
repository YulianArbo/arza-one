'use client';

import { createdResponseSchema, type LeadDetail } from '@arza/contracts';
import { DialogFooter, SelectField } from '@arza/ui';
import { useRouter } from 'next/navigation';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { queryString, useDuplicates } from '../parties/queries';
import { useCrmAction } from './crm-action';
import { CRM_PATHS } from './labels';
import { TextFields, type TextFieldSpec } from './text-fields';

// Convertir un prospecto calificado en oportunidad (B22): a nombre de la persona o de una
// organización de Terceros con el nombre de la empresa que mencionó.

export interface Conversion {
  readonly partyId: string;
  readonly title: string;
  readonly value: string;
  readonly expectedClose: string;
}

/** Problemas por campo; vacío si se puede enviar. */
export function conversionProblems(values: Conversion): Record<string, string> {
  const problems: Record<string, string> = {};
  if (values.title.trim().length < 3) problems['title'] = 'Escriba al menos tres letras.';
  if (!/^\d{1,16}(\.\d{1,2})?$/u.test(values.value.trim())) {
    problems['value'] = 'Escriba el valor en pesos, sin puntos de miles: 1500000.50';
  }
  if (values.expectedClose === '') problems['expectedClose'] = 'Elija la fecha esperada de cierre.';
  return problems;
}

function useClientOptions(lead: LeadDetail): { value: string; label: string }[] {
  const probe = lead.company_name === null ? '' : queryString({ name: lead.company_name });
  const organizations = (useDuplicates(probe).data?.data ?? []).filter(
    ({ party }) => party.kind === 'organization',
  );
  return [
    { value: lead.person.id, label: `${lead.person.name} (persona)` },
    ...organizations.map(({ party }) => ({ value: party.id, label: party.name })),
  ];
}

function useConvert(lead: LeadDetail) {
  const api = useApiClient();
  const router = useRouter();
  return useCrmAction<Conversion, string>(
    async (current, csrfToken) => {
      const body = {
        party_id: current.partyId,
        title: current.title.trim(),
        estimated_value: current.value.trim(),
        expected_close: current.expectedClose,
      };
      const path = `/v1/crm/leads/${lead.id}/actions/convert`;
      const options = { body, version: lead.version, schema: createdResponseSchema, csrfToken };
      return (await api.post(path, options)).id;
    },
    (id) => {
      router.push(CRM_PATHS.opportunity(id));
    },
  );
}

const FIELDS: readonly TextFieldSpec<'title' | 'value' | 'expectedClose'>[] = [
  { key: 'title', field: 'title', id: 'conversion-titulo', label: 'Título de la oportunidad' },
  {
    key: 'value',
    field: 'value',
    id: 'conversion-valor',
    label: 'Valor estimado (pesos)',
    decimal: true,
  },
  {
    key: 'expectedClose',
    field: 'expectedClose',
    id: 'conversion-cierre',
    label: 'Fecha esperada de cierre',
    type: 'date',
  },
];

export function ConvertForm({ lead }: { readonly lead: LeadDetail }): JSX.Element {
  const clients = useClientOptions(lead);
  const convert = useConvert(lead);
  const empty = { partyId: lead.person.id, title: '', value: '', expectedClose: '' };
  const [values, setValues] = useState<Conversion>(empty);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = conversionProblems(values);
    setProblems(found);
    if (Object.keys(found).length === 0) convert.execute(values);
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {convert.error === null ? null : <FormError error={convert.error} />}
      <SelectField
        id="conversion-cliente"
        label="Cliente de la oportunidad"
        hint="Si la empresa no aparece, regístrela primero en Terceros."
        options={clients}
        value={values.partyId}
        onChange={(event) => {
          setValues({ ...values, partyId: event.target.value });
        }}
      />
      <TextFields
        specs={FIELDS}
        values={values}
        problems={problems}
        onChange={(key, text) => {
          setValues({ ...values, [key]: text });
        }}
      />
      <DialogFooter>
        <SubmitButton label="Convertir" pendingLabel="Convirtiendo…" pending={convert.pending} />
      </DialogFooter>
      {convert.dialog}
    </form>
  );
}
