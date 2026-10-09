// Tipos del catálogo de permisos (anexo G). Los permisos se nombran módulo.recurso.acción.

/**
 * Nivel de cada permiso, con el que se deduce qué roles lo reciben a partir de la matriz del
 * numeral 15.3 (ver role-matrix.ts):
 * - read: leer (letras L y C).
 * - write: crear, editar u operar (letra C).
 * - approve: aprobar o ejecutar una transición crítica (letra A).
 * - manage: configurar el módulo; solo su dueño, quien tiene C y A a la vez.
 * - restricted: dato sensible; solo lo reciben los roles que el numeral 15.2 nombra.
 */
export type PermissionLevel = 'read' | 'write' | 'approve' | 'manage' | 'restricted';

/**
 * Campo del registro que dice de quién es, para los permisos «solo lo propio» (letra P):
 * - involved_user_ids: las personas relacionadas con el registro (quien lo creó, sus miembros,
 *   a quien está asignado). Cada módulo lo arma para sus registros.
 * - from_user_id: quien delega, en las delegaciones de aprobaciones.
 */
export type OwnField = 'involved_user_ids' | 'from_user_id';

/** Código, nivel, descripción y, si la letra P lo concede, el campo de «solo lo propio». */
export type PermissionEntry = readonly [
  code: string,
  level: PermissionLevel,
  description: string,
  own?: OwnField,
];

/** Fila del anexo G: un grupo de permisos con su módulo del manual. */
export interface PermissionGroupDefinition {
  /** Nombre de la fila del anexo G. */
  readonly key: string;
  readonly label: string;
  /** Módulo del capítulo 7 (M00 a M19). */
  readonly module: string;
  readonly entries: readonly PermissionEntry[];
}

export const OWN = 'involved_user_ids' satisfies OwnField;
