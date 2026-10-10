import { ACCESS_RULES, type DelegationStatus } from '@arza/contracts';

// Reglas de roles, asignaciones y delegaciones (ficha 17.2 y numerales 15.2 a 15.4, B10).

const DAY_MS = 24 * 60 * 60 * 1000;

/** Problemas de la vigencia de una asignación de rol. */
export type ExpiryProblem = 'in_past' | 'required' | 'too_long';

/**
 * El vencimiento, si lo hay, es futuro. El auditor siempre vence, a los 90 días como máximo
 * (numeral 15.2, «por tiempo limitado»).
 */
export function assignmentExpiryProblem(
  roleCode: string,
  validUntil: Date | null,
  now: Date,
): ExpiryProblem | null {
  if (validUntil !== null && validUntil.getTime() <= now.getTime()) return 'in_past';
  if (roleCode !== ACCESS_RULES.auditorRole) return null;
  if (validUntil === null) return 'required';
  const limit = now.getTime() + ACCESS_RULES.auditorMaxDays * DAY_MS;
  return validUntil.getTime() > limit ? 'too_long' : null;
}

/** El rol es para el mismo tipo de cuenta: internos en la aplicación, clientes en el portal. */
export function fitsAudience(roleAudience: string, userKind: string): boolean {
  return roleAudience === userKind;
}

/**
 * Código de un rol personalizado a partir de su nombre: «Apoyo comercial (junior)» es
 * APOYO_COMERCIAL_JUNIOR. Sin tildes, solo letras, números y guiones bajos.
 */
export function roleCodeFromName(name: string): string {
  const code = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
  return /^[A-Z]/.test(code) ? code : `ROL_${code}`;
}

export interface DelegationDraft {
  readonly actorId: string;
  readonly fromUserId: string;
  readonly toUserId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
}

/** Problemas de una delegación de aprobaciones. */
export type DelegationProblem =
  'same_person' | 'to_actor' | 'ends_before_start' | 'ends_in_past' | 'too_long';

/**
 * Una delegación va de una persona a otra, nunca a quien la registra (sería darse permisos a sí
 * mismo), termina en el futuro y dura 60 días como máximo.
 */
export function delegationProblem(draft: DelegationDraft, now: Date): DelegationProblem | null {
  if (draft.fromUserId === draft.toUserId) return 'same_person';
  if (draft.toUserId === draft.actorId) return 'to_actor';
  if (draft.endsAt.getTime() <= draft.startsAt.getTime()) return 'ends_before_start';
  if (draft.endsAt.getTime() <= now.getTime()) return 'ends_in_past';
  const length = draft.endsAt.getTime() - draft.startsAt.getTime();
  return length > ACCESS_RULES.delegationMaxDays * DAY_MS ? 'too_long' : null;
}

export function delegationStatus(
  delegation: { readonly startsAt: Date; readonly endsAt: Date; readonly revokedAt: Date | null },
  now: Date,
): DelegationStatus {
  if (delegation.revokedAt !== null) return 'revoked';
  if (delegation.endsAt.getTime() <= now.getTime()) return 'ended';
  return delegation.startsAt.getTime() > now.getTime() ? 'scheduled' : 'active';
}

/**
 * Cuenta sin uso para la revisión de accesos (ficha 17.2): activa y sin ingresar en los últimos
 * 60 días; si nunca ha entrado, cuenta desde que se creó.
 */
export function isUnusedAccount(
  user: { readonly status: string; readonly lastLoginAt: Date | null; readonly createdAt: Date },
  now: Date,
): boolean {
  if (user.status !== 'active') return false;
  const since = user.lastLoginAt ?? user.createdAt;
  return now.getTime() - since.getTime() > ACCESS_RULES.unusedAccountDays * DAY_MS;
}
