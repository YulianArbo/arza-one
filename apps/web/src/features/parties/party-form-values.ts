import {
  NIT_ID_TYPE,
  createPartyRequestSchema,
  type DataAuthorization,
  type PartyDetail,
  type PartyKind,
  type PartyRole,
} from '@arza/contracts';

import { queryString } from './queries';

// Valores del formulario del tercero y su paso al contrato (B13). El mismo esquema del contrato
// valida en la pantalla lo que la API vuelve a validar.

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
  readonly dataPurpose: string;
  readonly dataAuthorization: DataAuthorization | '';
  readonly dataAuthorizedOn: string;
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
  dataPurpose: '',
  dataAuthorization: '',
  dataAuthorizedOn: '',
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
    idType: party.id_type,
    idNumber: party.id_number,
    checkDigit: party.check_digit === null ? '' : String(party.check_digit),
    email: party.email ?? '',
    phone: party.phone ?? '',
    city: party.city ?? '',
    address: party.address ?? '',
    dataPurpose: party.data_purpose ?? '',
    dataAuthorization: party.data_authorization ?? '',
    dataAuthorizedOn: party.data_authorized_on ?? '',
    roles: party.roles,
    status: 'active',
  };
}

function text(value: string): string | null {
  return value.trim() === '' ? null : value.trim();
}

/** Datos del tercero como los pide la API; lo que no aplica a su tipo va vacío. */
export function partyBody(values: PartyFormValues): Record<string, unknown> {
  const person = values.kind === 'person';
  const isNit = values.idType === NIT_ID_TYPE;
  return {
    kind: values.kind,
    id_type: values.idType,
    id_number: values.idNumber.trim().toUpperCase(),
    check_digit: isNit && values.checkDigit.trim() !== '' ? Number(values.checkDigit) : null,
    email: text(values.email),
    phone: text(values.phone),
    city: text(values.city),
    address: text(values.address),
    legal_name: person ? null : text(values.legalName),
    trade_name: person ? null : text(values.tradeName),
    first_name: person ? text(values.firstName) : null,
    last_name: person ? text(values.lastName) : null,
    data_purpose: person ? text(values.dataPurpose) : null,
    data_authorization: person && values.dataAuthorization !== '' ? values.dataAuthorization : null,
    data_authorized_on: person ? text(values.dataAuthorizedOn) : null,
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
  data_purpose: 'Elija para qué se usarán los datos.',
  data_authorization: 'Elija cómo se obtuvo la autorización.',
  data_authorized_on: 'Escriba la fecha de la autorización.',
};

export type FieldErrors = Readonly<Record<string, string>>;

/** Problemas del formulario por campo, con el mismo esquema que usa la API. */
export function fieldErrors(values: PartyFormValues): FieldErrors {
  const result = createPartyRequestSchema.safeParse({
    ...partyBody(values),
    roles: values.roles,
    status: values.status,
  });
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '');
    const message = issue.code === 'custom' ? issue.message : FIELD_MESSAGES[field];
    errors[field] ??= message ?? 'Revise este dato.';
  }
  return errors;
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
