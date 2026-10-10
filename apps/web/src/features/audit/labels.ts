import type { AuditEvent, ChainProblem, SecuritySeverity } from '@arza/contracts';

// Textos de la auditoría (B11, numeral 16.6: sin jerga, trato de usted).

/** Rutas de la auditoría (numeral 16.7). */
export const AUDIT_PATHS = {
  events: '/app/auditoria',
  security: '/app/auditoria/seguridad',
  exports: '/app/auditoria/exportaciones',
  integrity: '/app/auditoria/integridad',
} as const;

/** Qué hizo cada acción, dicho para la persona. La acción sin traducir se muestra tal cual. */
const ACTION_LABELS: Readonly<Record<string, string>> = {
  'core.tenant.create': 'Creó la empresa',
  'iam.session.create': 'Inició sesión',
  'iam.session.revoke': 'Cerró una sesión',
  'iam.session.revoke_others': 'Cerró sus otras sesiones',
  'iam.session.reauthenticate': 'Confirmó su identidad',
  'iam.mfa.verify': 'Usó el segundo factor',
  'iam.mfa.setup_start': 'Empezó a configurar el segundo factor',
  'iam.mfa.setup_confirm': 'Activó el segundo factor',
  'iam.mfa.disable': 'Desactivó el segundo factor',
  'iam.mfa.recovery_codes_regenerate': 'Generó códigos de recuperación nuevos',
  'iam.password.change': 'Cambió su contraseña',
  'iam.password.reset_request': 'Pidió recuperar la contraseña',
  'iam.password.reset': 'Restableció la contraseña',
  'iam.link.issue': 'Se envió un enlace por correo',
  'iam.user.invite': 'Invitó a una persona',
  'iam.invitation.accept': 'Activó su cuenta',
  'iam.user.lock': 'Bloqueó una cuenta',
  'iam.user.reset_mfa': 'Reinició el segundo factor de una cuenta',
  'iam.role.create': 'Creó un rol',
  'iam.role.update': 'Editó un rol',
  'iam.role.sync': 'Actualizó los roles del sistema',
  'iam.role.assign': 'Asignó un rol',
  'iam.role.revoke': 'Retiró un rol',
  'iam.delegation.create': 'Creó una delegación',
  'iam.delegation.revoke': 'Retiró una delegación',
  'iam.access_review.read': 'Consultó la revisión de accesos',
  'audit.event.read': 'Consultó la auditoría',
  'audit.security.read': 'Consultó los eventos de seguridad',
  'audit.event.export': 'Exportó la auditoría',
  'audit.chain.verify': 'Verificó la integridad de la auditoría',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/** Quién actuó: la persona, «El sistema» o «Sin sesión». */
export function actorLabel(actor: AuditEvent['actor']): string {
  if (actor.kind === 'system') return 'El sistema';
  if (actor.kind === 'anonymous') return 'Sin sesión';
  return actor.display_name ?? actor.email ?? 'Persona sin datos';
}

export const RESULT_LABELS = { success: 'Éxito', failure: 'Fallo' } as const;

export const SEVERITY_LABELS: Readonly<Record<SecuritySeverity, string>> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  critical: 'Crítica',
};

export const SEVERITY_TONES: Readonly<
  Record<SecuritySeverity, 'neutral' | 'warning' | 'destructive'>
> = {
  low: 'neutral',
  medium: 'warning',
  high: 'destructive',
  critical: 'destructive',
};

export const CHAIN_PROBLEM_LABELS: Readonly<Record<ChainProblem, string>> = {
  missing: 'Falta un evento o hay uno de más.',
  altered: 'Un evento fue modificado después de registrarse.',
  broken_link: 'Un evento ya no está unido al anterior.',
  truncated: 'Se borraron los eventos más recientes.',
};

/** Lo que cambió, en una línea: «name: Apoyo → Apoyo comercial · bankAccount: cambió». */
export function changesSummary(changes: Record<string, unknown>): string {
  const parts = Object.entries(changes).map(([field, value]) => `${field}: ${valueText(value)}`);
  return parts.length === 0 ? '—' : parts.join(' · ');
}

function valueText(value: unknown): string {
  if (isRecord(value) && 'from' in value && 'to' in value) {
    return `${plain(value['from'])} → ${plain(value['to'])}`;
  }
  if (isRecord(value) && value['changed'] === true) return 'cambió';
  return plain(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function plain(value: unknown): string {
  if (value === null || value === undefined) return 'vacío';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** Tipo de registro, dicho para la persona. */
const ENTITY_LABELS: Readonly<Record<string, string>> = {
  tenant: 'Empresa',
  iam_user: 'Usuario',
  iam_role: 'Rol',
  iam_session: 'Sesión',
  iam_delegation: 'Delegación',
  iam_mfa_factor: 'Segundo factor',
  iam_token: 'Enlace de correo',
  iam_access_review: 'Revisión de accesos',
  aud_events: 'Auditoría',
  aud_exports: 'Exportación',
  aud_security_events: 'Eventos de seguridad',
};

export function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType;
}
