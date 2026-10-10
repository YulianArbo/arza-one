import {
  createMongoAbility,
  subject as recordOf,
  type MongoAbility,
  type MongoQuery,
} from '@casl/ability';
import { splitPermission, type OwnField, type PermissionCode } from '@arza/contracts';

// Autorización por rol y por registro con CASL (numeral 13.1, paso 8, y ADR-009). Cada permiso del
// anexo G se evalúa como «acción sobre recurso»: iam.user.lock es lock sobre iam.user. Un permiso
// «solo lo propio» (letra P) lleva la condición de que el registro sea de la persona.

export type AppAbility = MongoAbility;

/**
 * CASL trata la acción «manage» como «cualquier acción» y el recurso «all» como «cualquier
 * recurso». En el anexo G «manage» es un permiso más (party.due_diligence.manage registra, no
 * aprueba): sin esto, quien administra un recurso podría también aprobarlo o publicarlo.
 */
const NO_WILDCARDS = { anyAction: '__ninguna_accion__', anySubjectType: '__ningun_recurso__' };

/** Un permiso vigente de la persona: todo, o solo lo propio según el campo indicado. */
export interface PermissionGrant {
  readonly code: PermissionCode;
  /** null: vale para todo. Si no, el campo del registro que debe incluir a la persona. */
  readonly ownField: OwnField | null;
}

function conditionsFor(ownField: OwnField | null, userId: string): MongoQuery | undefined {
  // Un campo que es una lista (involved_user_ids) cumple si contiene a la persona.
  return ownField === null ? undefined : { [ownField]: userId };
}

/**
 * Permisos de una persona. Si un mismo permiso llega por dos roles, uno para todo y otro solo para
 * lo propio, vale el más amplio: CASL concede si cualquiera de las reglas lo permite.
 */
export function buildAbility(grants: readonly PermissionGrant[], userId: string): AppAbility {
  return createMongoAbility(
    grants.map((grant) => {
      const { subject, action } = splitPermission(grant.code);
      const conditions = conditionsFor(grant.ownField, userId);
      return conditions === undefined ? { action, subject } : { action, subject, conditions };
    }),
    NO_WILDCARDS,
  );
}

/**
 * La persona tiene el permiso, al menos sobre algunos registros. Sirve para la guarda de la ruta
 * y para mostrar u ocultar; sobre un registro concreto se usa canOnRecord.
 */
export function hasPermission(ability: AppAbility, code: PermissionCode): boolean {
  const { subject, action } = splitPermission(code);
  return ability.can(action, subject);
}

/** La persona tiene el permiso sobre todos los registros, no solo sobre los propios. */
export function hasUnconditionalPermission(ability: AppAbility, code: PermissionCode): boolean {
  const { subject, action } = splitPermission(code);
  return ability.rulesFor(action, subject).some((rule) => !rule.inverted && !rule.conditions);
}

/** La persona tiene el permiso sobre este registro concreto (autorización por registro). */
export function canOnRecord(
  ability: AppAbility,
  code: PermissionCode,
  record: Readonly<Record<string, unknown>>,
): boolean {
  const { subject, action } = splitPermission(code);
  return ability.can(action, recordOf(subject, { ...record }));
}
