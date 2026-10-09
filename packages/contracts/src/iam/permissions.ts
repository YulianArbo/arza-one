import { BUSINESS_PERMISSION_GROUPS } from './catalog-business.js';
import { CORE_PERMISSION_GROUPS } from './catalog-core.js';
import { PEOPLE_PERMISSION_GROUPS } from './catalog-people.js';
import type { OwnField, PermissionLevel } from './permission-types.js';

// Catálogo de permisos del anexo G (B10). Vive aquí y se carga en iam_permissions como dato
// semilla; la API y la web usan este mismo catálogo. Agregar un permiso exige actualizar la
// matriz del numeral 15.3 (role-matrix.ts).

export const PERMISSION_GROUPS = [
  ...CORE_PERMISSION_GROUPS,
  ...BUSINESS_PERMISSION_GROUPS,
  ...PEOPLE_PERMISSION_GROUPS,
] as const;

type GroupDefinition = (typeof PERMISSION_GROUPS)[number];

/** Código de un permiso del catálogo, por ejemplo «iam.user.read». */
export type PermissionCode = GroupDefinition['entries'][number][0];

export interface PermissionDefinition {
  readonly code: PermissionCode;
  readonly level: PermissionLevel;
  readonly description: string;
  /** Campo de «solo lo propio» si el permiso se puede conceder limitado a lo propio. */
  readonly ownField: OwnField | null;
  /** Fila del anexo G a la que pertenece. */
  readonly group: string;
}

function definitionsOf(group: GroupDefinition): PermissionDefinition[] {
  return group.entries.map((entry) => ({
    code: entry[0],
    level: entry[1],
    description: entry[2],
    ownField: entry.length === 4 ? entry[3] : null,
    group: group.key,
  }));
}

export const PERMISSIONS: readonly PermissionDefinition[] =
  PERMISSION_GROUPS.flatMap(definitionsOf);

const BY_CODE: ReadonlyMap<string, PermissionDefinition> = new Map(
  PERMISSIONS.map((permission) => [permission.code, permission]),
);

export function isPermissionCode(value: string): value is PermissionCode {
  return BY_CODE.has(value);
}

export function permissionDefinition(code: string): PermissionDefinition {
  const definition = BY_CODE.get(code);
  if (definition === undefined) throw new Error(`Permiso desconocido: ${code}`);
  return definition;
}

/**
 * Recurso y acción de un permiso: la acción es la última parte del nombre. «iam.user.read» es
 * leer en «iam.user»; «party.read» es leer en «party».
 */
export function splitPermission(code: string): {
  readonly subject: string;
  readonly action: string;
} {
  const cut = code.lastIndexOf('.');
  return { subject: code.slice(0, cut), action: code.slice(cut + 1) };
}

/** Permisos de aprobación: los únicos que se pueden delegar (ficha 17.2). */
export const APPROVAL_PERMISSIONS: readonly PermissionCode[] = PERMISSIONS.filter(
  (permission) => permission.level === 'approve',
).map((permission) => permission.code);

export function isApprovalPermission(code: string): boolean {
  return APPROVAL_PERMISSIONS.some((approval) => approval === code);
}
