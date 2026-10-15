import type { DuplicateReason } from '@arza/contracts';

// Detección de duplicados (ficha 17.3): dos fichas son posiblemente la misma persona u
// organización si comparten el número de documento (aunque el tipo difiera, como la cédula y el
// NIT de una persona natural), el correo, el teléfono o el nombre escrito igual.

/** Formas jurídicas que no distinguen a una organización: «Andina S.A.S.» es «Andina SAS». */
const LEGAL_FORMS = new Set(['sas', 'sa', 'ltda', 'eu', 'sca', 'scs', 'bic', 'y', 'cia']);

/** Nombre comparable: sin tildes, mayúsculas, puntuación ni forma jurídica. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replaceAll('.', '') // «s.a.s.» → «sas»
    .replaceAll(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((word) => word !== '' && !LEGAL_FORMS.has(word))
    .join(' ');
}

/** Teléfono comparable: solo dígitos y, si es largo, los diez últimos (sin el indicativo 57). */
export function normalizePhone(phone: string): string {
  const digits = phone.replaceAll(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** Lo que se busca: los datos del formulario o de la ficha que se está viendo. */
export interface DuplicateProbe {
  readonly idNumber?: string | undefined;
  readonly name?: string | undefined;
  readonly email?: string | undefined;
  readonly phone?: string | undefined;
}

/** Lo que se compara de cada tercero registrado. */
export interface PartyFingerprint {
  readonly idNumber: string;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
}

function sameText(
  left: string | undefined,
  right: string | null,
  normalize: (s: string) => string,
) {
  if (left === undefined || right === null) return false;
  const normalized = normalize(left);
  return normalized !== '' && normalized === normalize(right);
}

/** Razones por las que el tercero registrado parece el mismo que se busca; vacío si no. */
export function duplicateReasons(
  probe: DuplicateProbe,
  party: PartyFingerprint,
): DuplicateReason[] {
  const checks: readonly (readonly [DuplicateReason, boolean])[] = [
    ['id_number', sameText(probe.idNumber, party.idNumber, (s) => s.trim().toUpperCase())],
    ['email', sameText(probe.email, party.email, (s) => s.trim().toLowerCase())],
    ['phone', sameText(probe.phone, party.phone, normalizePhone)],
    ['name', sameText(probe.name, party.name, normalizeName)],
  ];
  return checks.filter(([, matches]) => matches).map(([reason]) => reason);
}
