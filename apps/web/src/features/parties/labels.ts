import type {
  BankAccountStatus,
  BankAccountType,
  DataAuthorization,
  DueDiligenceState,
  DuplicateReason,
  PartyKind,
  PartyRole,
  PartyStatus,
  PartySummary,
  ReviewStatus,
  RiskLevel,
} from '@arza/contracts';

// Textos de terceros (B13, numeral 16.6: sin jerga, trato de usted).

type Tone = 'neutral' | 'success' | 'warning' | 'destructive' | 'info';

export const PARTIES_PATH = '/app/terceros';
export const NEW_PARTY_PATH = `${PARTIES_PATH}/nuevo`;

export function partyPath(id: string): string {
  return `${PARTIES_PATH}/${id}`;
}

export const KIND_LABELS: Readonly<Record<PartyKind, string>> = {
  organization: 'Organización',
  person: 'Persona',
};

export const STATUS_LABELS: Readonly<Record<PartyStatus, string>> = {
  prospect: 'Prospecto',
  active: 'Activo',
  inactive: 'Inactivo',
  blocked: 'Bloqueado',
};

export const STATUS_TONES: Readonly<Record<PartyStatus, Tone>> = {
  prospect: 'info',
  active: 'success',
  inactive: 'neutral',
  blocked: 'destructive',
};

export const ROLE_LABELS: Readonly<Record<PartyRole, string>> = {
  customer: 'Cliente',
  supplier: 'Proveedor',
  employee: 'Colaborador',
  contact: 'Contacto',
  candidate: 'Candidato',
};

export const AUTHORIZATION_LABELS: Readonly<Record<DataAuthorization, string>> = {
  written: 'Documento firmado',
  digital: 'Formulario web o correo',
  verbal: 'Verbal, con constancia',
  contract: 'Cláusula del contrato',
};

export const RISK_LABELS: Readonly<Record<RiskLevel, string>> = {
  low: 'Bajo',
  medium: 'Medio',
  high: 'Alto',
};

export const RISK_TONES: Readonly<Record<RiskLevel, Tone>> = {
  low: 'success',
  medium: 'warning',
  high: 'destructive',
};

export const ACCOUNT_TYPE_LABELS: Readonly<Record<BankAccountType, string>> = {
  savings: 'Ahorros',
  checking: 'Corriente',
};

export const ACCOUNT_STATUS_LABELS: Readonly<Record<BankAccountStatus, string>> = {
  pending: 'Pendiente de aprobación',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  replaced: 'Reemplazada',
};

export const ACCOUNT_STATUS_TONES: Readonly<Record<BankAccountStatus, Tone>> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  replaced: 'neutral',
};

export const REVIEW_STATUS_LABELS: Readonly<Record<ReviewStatus, string>> = {
  pending: 'Pendiente de aprobación',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};

export const DUE_DILIGENCE_LABELS: Readonly<Record<DueDiligenceState, string>> = {
  none: 'Sin conocimiento del tercero',
  pending: 'Conocimiento pendiente de aprobación',
  approved: 'Apto: conocimiento aprobado',
  rejected: 'No apto: conocimiento rechazado',
  expired: 'No apto: conocimiento vencido',
};

export const DUE_DILIGENCE_TONES: Readonly<Record<DueDiligenceState, Tone>> = {
  none: 'neutral',
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  expired: 'destructive',
};

export const DUPLICATE_REASON_LABELS: Readonly<Record<DuplicateReason, string>> = {
  id_number: 'mismo número de documento',
  email: 'mismo correo',
  phone: 'mismo teléfono',
  name: 'mismo nombre',
};

/** Texto del botón que lleva a cada estado; desde bloqueado, activar es desbloquear. */
export function statusActionLabel(from: PartyStatus, to: PartyStatus): string {
  if (to === 'active') return from === 'blocked' ? 'Desbloquear' : 'Activar';
  return to === 'inactive' ? 'Inactivar' : 'Bloquear';
}

/** «NIT 900123456-8» o «CC 1020304050». */
export function identification(
  party: Pick<PartySummary, 'id_type' | 'id_number' | 'check_digit'>,
): string {
  const digit = party.check_digit === null ? '' : `-${String(party.check_digit)}`;
  return `${party.id_type} ${party.id_number}${digit}`;
}

/** Valores de un estado o lista del contrato como opciones de una lista desplegable. */
export function optionsFrom<K extends string>(
  values: readonly K[],
  labels: Readonly<Record<K, string>>,
): { value: K; label: string }[] {
  return values.map((value) => ({ value, label: labels[value] }));
}
