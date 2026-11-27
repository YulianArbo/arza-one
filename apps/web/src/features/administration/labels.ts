import type { DelegationStatus, UserKind, UserStatus } from '@arza/contracts';

// Textos de la administración de usuarios y roles (numeral 16.6: sin jerga, trato de usted).

export const USER_STATUS_LABELS: Readonly<Record<UserStatus, string>> = {
  invited: 'Invitado',
  active: 'Activo',
  locked: 'Bloqueado',
  inactive: 'Inactivo',
};

export const USER_STATUS_TONES: Readonly<
  Record<UserStatus, 'neutral' | 'success' | 'warning' | 'destructive'>
> = {
  invited: 'neutral',
  active: 'success',
  locked: 'destructive',
  inactive: 'warning',
};

export const USER_KIND_LABELS: Readonly<Record<UserKind, string>> = {
  internal: 'Interno',
  portal: 'Portal del cliente',
};

export const DELEGATION_STATUS_LABELS: Readonly<Record<DelegationStatus, string>> = {
  scheduled: 'Programada',
  active: 'Vigente',
  ended: 'Terminada',
  revoked: 'Retirada',
};

/** Rutas de la administración (numeral 16.7). */
export const ADMIN_PATHS = {
  home: '/app/administracion',
  users: '/app/administracion/usuarios',
  roles: '/app/administracion/roles',
  newRole: '/app/administracion/roles/nuevo',
  delegations: '/app/administracion/delegaciones',
  accessReview: '/app/administracion/revision-de-accesos',
  company: '/app/administracion/empresa',
  structure: '/app/administracion/procesos-y-cargos',
  costCenters: '/app/administracion/centros-de-costo',
  catalogs: '/app/administracion/catalogos',
  parameters: '/app/administracion/parametros',
  sequences: '/app/administracion/consecutivos',
  holidays: '/app/administracion/festivos',
  announcements: '/app/administracion/comunicados',
  tenants: '/app/administracion/empresas',
} as const;

/**
 * Permisos que muestran el módulo Administración en el menú: basta con uno. Incluye el del operador
 * de la plataforma (B48), que solo administra las empresas.
 */
export const ADMINISTRATION_PERMISSIONS: readonly string[] = [
  'core.tenant.update',
  'core.org.manage',
  'core.catalog.manage',
  'core.parameter.manage',
  'core.sequence.manage',
  'iam.user.read',
  'iam.role.read',
  'iam.delegation.manage',
  'iam.access_review.read',
  'wf.definition.manage',
  'ntf.template.manage',
  'platform.tenant.read',
];

export function userPath(id: string): string {
  return `${ADMIN_PATHS.users}/${id}`;
}

export function rolePath(id: string): string {
  return `${ADMIN_PATHS.roles}/${id}`;
}

/** Nombre para mostrar: el nombre, o el correo si todavía no lo tiene. */
export function personName(person: {
  readonly display_name: string | null;
  readonly email: string;
}): string {
  return person.display_name ?? person.email;
}

/**
 * Último momento del día elegido en un campo de fecha, en hora de Colombia: un rol que «vence el
 * 31/12/2026» sirve todo ese día.
 */
export function endOfBogotaDay(value: string): string {
  return new Date(`${value}T23:59:59-05:00`).toISOString();
}

/** Primer momento del día elegido, en hora de Colombia. */
export function startOfBogotaDay(value: string): string {
  return new Date(`${value}T00:00:00-05:00`).toISOString();
}
