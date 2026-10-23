'use client';

import { createdResponseSchema } from '@arza/contracts';
import { Button } from '@arza/ui';
import { useRouter } from 'next/navigation';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { queryString } from '../parties/queries';
import { ConsentFields } from '../privacy/consent-fields';
import { consentErrors, type ConsentErrors } from '../privacy/consent-values';
import { useCrmAction } from './crm-action';
import { CRM_PATHS } from './labels';
import { ExistingPerson, LeadFields, PersonFields } from './lead-form-fields';
import {
  EMPTY_LEAD,
  leadBody,
  leadErrors,
  type LeadErrors,
  type LeadFormValues,
} from './lead-form-values';
import { useLeadNotices } from './queries';

// Registrar un prospecto (B22, ficha 17.6; numeral 16.4, patrón de formulario). Todo prospecto
// guarda su autorización de tratamiento (B17). Si la persona ya está en Terceros, se usa esa.

function Consent(props: {
  readonly values: LeadFormValues;
  readonly errors: ConsentErrors;
  readonly saveError: unknown;
  readonly onChange: (values: LeadFormValues) => void;
}): JSX.Element {
  const notices = useLeadNotices(props.saveError);
  if (notices.data === undefined) {
    return <p className="text-sm text-muted-foreground">Cargando el texto de autorización…</p>;
  }
  return (
    <ConsentFields
      idPrefix="prospecto-autorizacion"
      notices={notices.data.data}
      values={props.values.consent}
      errors={props.errors}
      onChange={(consent) => {
        props.onChange({ ...props.values, consent });
      }}
    />
  );
}

function probeOf(values: LeadFormValues): string {
  const name = `${values.firstName} ${values.lastName}`.trim();
  return queryString({
    email: values.email,
    phone: values.phone,
    name: name.length >= 3 ? name : null,
  });
}

function useSaveLead() {
  const router = useRouter();
  const api = useApiClient();
  return useCrmAction<LeadFormValues, string>(
    async (current, csrfToken) => {
      const options = { body: leadBody(current), schema: createdResponseSchema, csrfToken };
      return (await api.post('/v1/crm/leads', options)).id;
    },
    (id) => {
      router.push(CRM_PATHS.lead(id));
    },
  );
}

function useLeadForm() {
  const [values, setValues] = useState(EMPTY_LEAD);
  const [errors, setErrors] = useState<LeadErrors>({});
  const [consent, setConsent] = useState<ConsentErrors>({});
  const [probe, setProbe] = useState('');
  const save = useSaveLead();
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = leadErrors(values);
    const consentFound = consentErrors(values.consent);
    setErrors(found);
    setConsent(consentFound);
    if (Object.keys(found).length + Object.keys(consentFound).length > 0) return;
    save.execute(values);
  };
  const refreshProbe = (): void => {
    setProbe(probeOf(values));
  };
  const invalid = Object.keys(errors).length + Object.keys(consent).length > 0;
  return { values, setValues, errors, consent, invalid, probe, refreshProbe, save, submit };
}

function FormButtons({ pending }: { readonly pending: boolean }): JSX.Element {
  const router = useRouter();
  return (
    <div className="flex gap-2">
      <SubmitButton label="Registrar prospecto" pendingLabel="Registrando…" pending={pending} />
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

export function LeadForm(): JSX.Element {
  const form = useLeadForm();
  const fields = { values: form.values, errors: form.errors, onChange: form.setValues };
  return (
    <form noValidate onSubmit={form.submit} className="flex max-w-3xl flex-col gap-4">
      {form.save.error === null ? null : <FormError error={form.save.error} />}
      {form.invalid ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          Revise los datos marcados antes de guardar.
        </p>
      ) : null}
      <PersonFields {...fields} onProbe={form.refreshProbe} />
      {form.values.partyId === '' ? <ExistingPerson {...fields} probe={form.probe} /> : null}
      <LeadFields {...fields} />
      <Consent
        values={form.values}
        errors={form.consent}
        saveError={form.save.error}
        onChange={form.setValues}
      />
      <FormButtons pending={form.save.pending} />
      {form.save.dialog}
    </form>
  );
}
