'use client';

import { Alert, AlertDescription, AlertTitle, Button, SelectField, TextareaField } from '@arza/ui';
import { Users } from 'lucide-react';
import type { JSX } from 'react';

import { useCatalog } from '../organization/queries';
import { TextInput } from '../organization/record-dialog';
import { useDuplicates } from '../parties/queries';
import type { LeadErrors, LeadFormValues } from './lead-form-values';
import { useCampaigns } from './queries';

// Campos del formulario del prospecto (B22): la persona (nueva o ya registrada en Terceros), su
// necesidad, por dónde llegó y la campaña.

export interface FieldsProps {
  readonly values: LeadFormValues;
  readonly errors: LeadErrors;
  readonly onChange: (values: LeadFormValues) => void;
}

interface Option {
  readonly value: string;
  readonly label: string;
}

function useSourceOptions(): Option[] {
  const items = useCatalog('crm_lead_sources').data?.items ?? [];
  const active = items.filter((item) => item.is_active);
  return [
    { value: '', label: 'Elija por dónde llegó' },
    ...active.map((item) => ({ value: item.code, label: item.label })),
  ];
}

function useCampaignOptions(): Option[] {
  const campaigns = useCampaigns().data?.data ?? [];
  return [
    { value: '', label: 'Sin campaña' },
    ...campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name })),
  ];
}

/** Personas de Terceros con el mismo correo, teléfono o nombre: se puede usar una de ellas. */
export function ExistingPerson(
  props: FieldsProps & { readonly probe: string },
): JSX.Element | null {
  const people = (useDuplicates(props.probe).data?.data ?? []).filter(
    ({ party }) => party.kind === 'person',
  );
  if (people.length === 0) return null;
  return (
    <Alert tone="info" role="status">
      <Users aria-hidden="true" />
      <AlertTitle>Esta persona puede estar ya registrada</AlertTitle>
      <AlertDescription>
        <ul className="flex flex-col gap-2">
          {people.map(({ party }) => (
            <li key={party.id} className="flex flex-wrap items-center gap-2">
              <span>
                {party.name} · {party.email ?? party.phone ?? 'sin contacto'}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  props.onChange({ ...props.values, partyId: party.id, firstName: party.name });
                }}
              >
                Usar esta persona
              </Button>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function ChosenPerson({ values, onChange }: FieldsProps): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm">
      <span>
        Se usará la persona registrada <strong>{values.firstName}</strong>.
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => {
          onChange({ ...values, partyId: '', firstName: '' });
        }}
      >
        Registrar otra
      </Button>
    </div>
  );
}

const PERSON_FIELDS = [
  ['firstName', 'first_name', 'prospecto-nombres', 'Nombres', 'text'],
  ['lastName', 'last_name', 'prospecto-apellidos', 'Apellidos', 'text'],
  ['email', 'email', 'prospecto-correo', 'Correo', 'email'],
  ['phone', 'phone', 'prospecto-telefono', 'Teléfono', 'tel'],
] as const;

export function PersonFields(props: FieldsProps & { readonly onProbe: () => void }): JSX.Element {
  const { values, errors, onChange } = props;
  if (values.partyId !== '') return <ChosenPerson {...props} />;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {PERSON_FIELDS.map(([key, field, id, label, type]) => (
        <TextInput
          key={id}
          id={id}
          label={label}
          type={type}
          value={values[key]}
          error={errors[field] ?? null}
          onValue={(text) => {
            onChange({ ...values, [key]: text });
          }}
          onBlur={props.onProbe}
          {...(key === 'email' ? { hint: 'El correo o el teléfono, para poder contactarla.' } : {})}
        />
      ))}
    </div>
  );
}

function OriginFields({ values, errors, onChange }: FieldsProps): JSX.Element {
  const sources = useSourceOptions();
  const campaigns = useCampaignOptions();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField
        id="prospecto-origen"
        label="Origen"
        options={sources}
        value={values.source}
        error={errors['source']}
        onChange={(event) => {
          onChange({ ...values, source: event.target.value });
        }}
      />
      <SelectField
        id="prospecto-campana"
        label="Campaña"
        options={campaigns}
        value={values.campaignId}
        onChange={(event) => {
          onChange({ ...values, campaignId: event.target.value });
        }}
      />
    </div>
  );
}

export function LeadFields(props: FieldsProps): JSX.Element {
  const { values, errors, onChange } = props;
  return (
    <>
      <TextInput
        id="prospecto-empresa"
        label="Empresa (si la mencionó)"
        value={values.companyName}
        error={errors['company_name'] ?? null}
        onValue={(companyName) => {
          onChange({ ...values, companyName });
        }}
      />
      <TextareaField
        id="prospecto-necesidad"
        label="¿Qué necesita?"
        value={values.need}
        maxLength={2000}
        error={errors['need'] ?? null}
        onChange={(event) => {
          onChange({ ...values, need: event.target.value });
        }}
      />
      <OriginFields {...props} />
    </>
  );
}
