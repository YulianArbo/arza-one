'use client';

import { SelectField } from '@arza/ui';
import {
  createProcessorRequestSchema,
  partyListResponseSchema,
  type Processor,
} from '@arza/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useFiles } from '../files/queries';
import { CheckboxField, TextInput } from '../organization/record-dialog';
import { useSaveProcessor } from './queries';

// Formulario de un encargado (B17): la organización, el servicio, el país, la próxima revisión
// y el contrato de transmisión, que es un archivo propio ya revisado por el antivirus.

interface ProcessorValues {
  readonly partyId: string;
  readonly service: string;
  readonly country: string;
  readonly contractFileId: string;
  readonly reviewOn: string;
  readonly active: boolean;
}

function valuesOf(processor: Processor | null): ProcessorValues {
  return {
    partyId: processor?.party.id ?? '',
    service: processor?.service ?? '',
    country: processor?.country ?? 'CO',
    contractFileId: processor?.contract_file_id ?? '',
    reviewOn: processor?.review_on ?? '',
    active: processor === null || processor.status === 'active',
  };
}

const MESSAGES: Readonly<Record<string, string>> = {
  party_id: 'Elija la organización que presta el servicio.',
  service: 'Describa el servicio en al menos 3 caracteres.',
  country: 'Use el código de dos letras del país, como CO o US.',
  review_on: 'Escriba la fecha de la próxima revisión.',
};

function bodyOf(values: ProcessorValues) {
  return {
    party_id: values.partyId,
    service: values.service,
    country: values.country,
    contract_file_id: values.contractFileId === '' ? null : values.contractFileId,
    review_on: values.reviewOn,
  };
}

function problemsOf(values: ProcessorValues): Record<string, string> {
  const result = createProcessorRequestSchema.safeParse(bodyOf(values));
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '');
    errors[field] ??= MESSAGES[field] ?? 'Revise este dato.';
  }
  return errors;
}

/** Organizaciones registradas en Terceros, para elegir el encargado. */
function useOrganizationOptions(enabled: boolean) {
  const api = useApiClient();
  const parties = useQuery({
    queryKey: ['parties', 'organizations-for-processors'],
    queryFn: ({ signal }) =>
      api.get('/v1/parties?limit=100', { schema: partyListResponseSchema, signal }),
    enabled,
  });
  const organizations = (parties.data?.data ?? []).filter((party) => party.kind === 'organization');
  return [
    { value: '', label: 'Elija la organización' },
    ...organizations.map((party) => ({ value: party.id, label: party.name })),
  ];
}

function useContractOptions() {
  const files = (useFiles().data?.data ?? []).filter((file) => file.status === 'available');
  return [
    { value: '', label: 'Todavía no hay contrato' },
    ...files.map((file) => ({ value: file.id, label: file.file_name })),
  ];
}

interface FieldsProps {
  readonly creating: boolean;
  readonly values: ProcessorValues;
  readonly errors: Record<string, string>;
  readonly onChange: (values: ProcessorValues) => void;
}

function WhoAndWhat({ values, errors, onChange, creating }: FieldsProps): JSX.Element {
  const organizations = useOrganizationOptions(creating);
  return (
    <>
      {creating ? (
        <SelectField
          id="encargado-tercero"
          label="Organización"
          hint="Debe estar registrada en Terceros."
          options={organizations}
          value={values.partyId}
          error={errors['party_id']}
          onChange={(event) => {
            onChange({ ...values, partyId: event.target.value });
          }}
        />
      ) : null}
      <TextInput
        id="encargado-servicio"
        label="Servicio que presta con los datos"
        value={values.service}
        maxLength={300}
        error={errors['service'] ?? null}
        onValue={(service) => {
          onChange({ ...values, service });
        }}
      />
    </>
  );
}

function WhereAndWhen({ values, errors, onChange }: FieldsProps): JSX.Element {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextInput
        id="encargado-pais"
        label="País donde trata los datos"
        hint="Código de dos letras: CO, US, DE…"
        value={values.country}
        maxLength={2}
        error={errors['country'] ?? null}
        onValue={(country) => {
          onChange({ ...values, country: country.toUpperCase() });
        }}
      />
      <TextInput
        id="encargado-revision"
        label="Próxima revisión"
        type="date"
        value={values.reviewOn}
        error={errors['review_on'] ?? null}
        onValue={(reviewOn) => {
          onChange({ ...values, reviewOn });
        }}
      />
    </div>
  );
}

function ContractAndStatus({ values, errors, onChange, creating }: FieldsProps): JSX.Element {
  const contracts = useContractOptions();
  return (
    <>
      <SelectField
        id="encargado-contrato"
        label="Contrato de transmisión"
        hint="Súbalo antes en Archivos. Sin contrato, el encargado queda con la alerta."
        options={contracts}
        value={values.contractFileId}
        error={errors['contract_file_id']}
        onChange={(event) => {
          onChange({ ...values, contractFileId: event.target.value });
        }}
      />
      {creating ? null : (
        <CheckboxField
          id="encargado-activo"
          label="Activo"
          checked={values.active}
          onChange={(active) => {
            onChange({ ...values, active });
          }}
        />
      )}
    </>
  );
}

function ProcessorFields(props: FieldsProps): JSX.Element {
  return (
    <>
      <WhoAndWhat {...props} />
      <WhereAndWhen {...props} />
      <ContractAndStatus {...props} />
    </>
  );
}

export function ProcessorForm(props: {
  readonly processor: Processor | null;
  readonly onDone: () => void;
}): JSX.Element {
  const { processor } = props;
  const [values, setValues] = useState(valuesOf(processor));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSaveProcessor(props.onDone);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = problemsOf(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const { party_id: partyId, ...fields } = bodyOf(values);
    save.execute(
      processor === null
        ? { id: null, body: { party_id: partyId, ...fields } }
        : {
            id: processor.id,
            version: processor.version,
            body: { ...fields, status: values.active ? 'active' : 'inactive' },
          },
    );
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {save.error === null ? null : <FormError error={save.error} />}
      <ProcessorFields
        creating={processor === null}
        values={values}
        errors={errors}
        onChange={setValues}
      />
      <SubmitButton label="Guardar" pendingLabel="Guardando…" pending={save.pending} />
      {save.dialog}
    </form>
  );
}
