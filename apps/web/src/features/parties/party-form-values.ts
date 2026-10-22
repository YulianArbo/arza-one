import {
  NIT_ID_TYPE,
  createPartyRequestSchema,
  type PartyDetail,
  type PartyKind,
  type PartyRole,
} from '@arza/contracts';

import {
  EMPTY_CONSENT,
  consentBody,
  consentErrors,
  type ConsentErrors,
  type ConsentValues,
} from '../privacy/consent-values';
import { queryString } from './queries';

// Valores del formulario del tercero y su paso al contrato (B13). El mismo esquema del contrato
// valida en la pantalla lo que la API vuelve a validar. Una persona nueva lleva su autorización de
// tratamiento (B17), con el componente de privacidad.

export interface PartyFormValues {
  readonly kind: PartyKind;
  readonly legalName: string;
  readonly tradeName: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly idType: string;
  readonly idNumber: string;
  readonly checkDigit: string;
  readonly email: string;
  readonly phone: string;
  readonly city: string;
  readonly address: string;
  readonly consent: ConsentValues;
  readonly roles: readonly PartyRole[];
  readonly status: 'active' | 'prospect';
}

export const EMPTY_PARTY: PartyFormValues = {
  kind: 'organization',
  legalName: '',
  tradeName: '',
  firstName: '',
  lastName: '',
  idType: NIT_ID_TYPE,
  idNumber: '',
  checkDigit: '',
  email: '',
  phone: '',
  city: '',
  address: '',
  consent: EMPTY_CONSENT,
  roles: [],
  status: 'active',
};

export function valuesOf(party: PartyDetail): PartyFormValues {
  return {
    kind: party.kind,
    legalName: party.legal_name ?? '',
    tradeName: party.trade_name ?? '',
    firstName: party.first_name ?? '',
    lastName: party.last_name ?? '',
    idType: party.id_type ?? NIT_ID_TYPE,
    idNumber: party.id_number ?? '',
    checkDigit: party.check_digit === null ? '' : String(party.check_digit),
    email: party.email ?? '',
    phone: party.phone ?? '',
    city: party.city ?? '',
    address: party.address ?? '',
    consent: EMPTY_CONSENT,
    roles: party.roles,
    // Solo el prospecto puede quedar sin documento (B22): así lo revisa también la pantalla.
    status: party.status === 'prospect' ? 'prospect' : 'active',
  };
}

function text(value: string): string | null {
  return value.trim() === '' ? null : value.trim();
}

/** Datos del tercero como los pide la API; lo que no aplica a su tipo va vacío. */
export function partyBody(values: PartyFormValues): Record<string, unknown> {
  const person = values.kind === 'person';
  const isNit = values.idType === NIT_ID_TYPE;
  const idNumber = values.idNumber.trim().toUpperCase();
  return {
    kind: values.kind,
    // Sin número no hay documento: un prospecto puede registrarse así (B22).
    id_type: idNumber === '' ? null : values.idType,
    id_number: idNumber === '' ? null : idNumber,
    check_digit: isNit && values.checkDigit.trim() !== '' ? Number(values.checkDigit) : null,
    email: text(values.email),
    phone: text(values.phone),
    city: text(values.city),
    address: text(values.address),
    legal_name: person ? null : text(values.legalName),
    trade_name: person ? null : text(values.tradeName),
    first_name: person ? text(values.firstName) : null,
    last_name: person ? text(values.lastName) : null,
  };
}

/** Registro nuevo: los datos, los papeles, el estado y, si es persona, su autorización. */
export function createBody(values: PartyFormValues): Record<string, unknown> {
  return {
    ...partyBody(values),
    roles: values.roles,
    status: values.status,
    consent: values.kind === 'person' ? consentBody(values.consent) : null,
  };
}

/** Qué decir de cada campo cuando el problema no trae un mensaje propio en español. */
const FIELD_MESSAGES: Readonly<Record<string, string>> = {
  legal_name: 'Escriba la razón social.',
  first_name: 'Escriba los nombres.',
  last_name: 'Escriba los apellidos.',
  id_type: 'Elija el tipo de documento.',
  id_number: 'Escriba el número de documento: solo letras y números.',
  check_digit: 'Escriba el dígito de verificación del NIT.',
  email: 'Escriba un correo válido, por ejemplo nombre@empresa.com.',
  phone: 'Escriba solo números, con el indicativo si es del exterior.',
};

export type FieldErrors = Readonly<Record<string, string>>;

/** Problemas de los datos por campo, con el mismo esquema que usa la API. */
export function fieldErrors(values: PartyFormValues): FieldErrors {
  const result = createPartyRequestSchema.safeParse({ ...createBody(values), consent: null });
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '');
    if (field === 'consent') continue;
    const message = issue.code === 'custom' ? issue.message : FIELD_MESSAGES[field];
    errors[field] ??= message ?? 'Revise este dato.';
  }
  return errors;
}

/** Problemas de la autorización: solo al registrar una persona. */
export function newPersonConsentErrors(values: PartyFormValues, creating: boolean): ConsentErrors {
  return creating && values.kind === 'person' ? consentErrors(values.consent) : {};
}

/** Búsqueda de posibles duplicados con lo que ya se escribió. */
export function duplicateQuery(values: PartyFormValues, excludeId: string | null): string {
  const name =
    values.kind === 'person' ? `${values.firstName} ${values.lastName}` : values.legalName;
  const probe = {
    id_number: values.idNumber.trim().length >= 3 ? values.idNumber.toUpperCase() : null,
    name: name.trim().length >= 3 ? name : null,
    email: values.email,
    phone: values.phone,
  };
  if (Object.values(probe).every((value) => value === null || value.trim() === '')) return '';
  return queryString({ ...probe, exclude_id: excludeId });
}
