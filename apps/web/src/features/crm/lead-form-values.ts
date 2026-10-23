import { createLeadRequestSchema } from '@arza/contracts';

import { EMPTY_CONSENT, consentBody, type ConsentValues } from '../privacy/consent-values';

// Valores del formulario del prospecto (B22) y su paso al contrato. El mismo esquema valida en la
// pantalla lo que la API vuelve a validar. Sin persona elegida de Terceros, se registra una nueva.

export interface LeadFormValues {
  /** Persona ya registrada en Terceros; vacío para registrar una nueva. */
  readonly partyId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
  readonly companyName: string;
  readonly need: string;
  readonly source: string;
  readonly campaignId: string;
  readonly consent: ConsentValues;
}

export const EMPTY_LEAD: LeadFormValues = {
  partyId: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  companyName: '',
  need: '',
  source: '',
  campaignId: '',
  consent: EMPTY_CONSENT,
};

function text(value: string): string | null {
  return value.trim() === '' ? null : value.trim();
}

function personOf(values: LeadFormValues) {
  if (values.partyId !== '') return null;
  return {
    first_name: values.firstName.trim(),
    last_name: values.lastName.trim(),
    email: text(values.email),
    phone: text(values.phone),
  };
}

/** El prospecto como lo pide la API. */
export function leadBody(values: LeadFormValues): Record<string, unknown> {
  return {
    party_id: text(values.partyId),
    person: personOf(values),
    company_name: text(values.companyName),
    need: values.need.trim(),
    source: values.source,
    campaign_id: text(values.campaignId),
    consent: consentBody(values.consent),
  };
}

const MESSAGES: Readonly<Record<string, string>> = {
  first_name: 'Escriba los nombres.',
  last_name: 'Escriba los apellidos.',
  email: 'Escriba un correo válido, por ejemplo nombre@empresa.com.',
  phone: 'Escriba solo números, con el indicativo si es del exterior.',
  need: 'Cuéntenos qué necesita (al menos tres letras).',
  source: 'Elija por dónde llegó.',
  company_name: 'Escriba al menos dos letras.',
};

export type LeadErrors = Readonly<Record<string, string>>;

/** Problemas de los datos por campo, sin la autorización (la revisa su propio componente). */
export function leadErrors(values: LeadFormValues): LeadErrors {
  const result = createLeadRequestSchema.safeParse(leadBody(values));
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const [first, second] = issue.path.map(String);
    if (first === 'consent') continue;
    const field = first === 'person' && second !== undefined ? second : (first ?? '');
    errors[field] ??=
      issue.code === 'custom' ? issue.message : (MESSAGES[field] ?? 'Revise este dato.');
  }
  return errors;
}
