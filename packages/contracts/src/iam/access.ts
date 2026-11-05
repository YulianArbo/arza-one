import { z } from 'zod';

import { isPermissionCode, type PermissionCode } from './permissions.js';

// Contratos de roles y permisos (M01, B10).

/** Códigos estables de los errores de autorización (numeral 14.2). */
export const ACCESS_ERROR_CODES = {
  permissionDenied: 'PERMISSION_DENIED',
  selfPermissionChange: 'SELF_PERMISSION_CHANGE',
  selfAction: 'SELF_ACTION_NOT_ALLOWED',
  systemRoleReadonly: 'SYSTEM_ROLE_READONLY',
  roleNameTaken: 'ROLE_NAME_TAKEN',
  roleAudienceMismatch: 'ROLE_AUDIENCE_MISMATCH',
  roleAlreadyAssigned: 'ROLE_ALREADY_ASSIGNED',
  roleExpiryInvalid: 'ROLE_EXPIRY_INVALID',
  permissionScopeInvalid: 'PERMISSION_SCOPE_INVALID',
  delegationInvalid: 'DELEGATION_INVALID',
  userStateInvalid: 'USER_STATE_INVALID',
  userNotFound: 'USER_NOT_FOUND',
  roleNotFound: 'ROLE_NOT_FOUND',
  assignmentNotFound: 'ROLE_ASSIGNMENT_NOT_FOUND',
  delegationNotFound: 'DELEGATION_NOT_FOUND',
  positionNotFound: 'POSITION_NOT_FOUND',
  positionInactive: 'POSITION_INACTIVE',
  clientCompanyInvalid: 'CLIENT_COMPANY_INVALID',
} as const;

export const permissionCodeSchema = z
  .string()
  .refine((value): value is PermissionCode => isPermissionCode(value), {
    message: 'Permiso desconocido',
  })
  .describe('Permiso del anexo G, por ejemplo iam.user.read');

/** Alcance de un permiso: todo, o solo lo propio (letra P del numeral 15.3). */
export const permissionScopeSchema = z.enum(['all', 'own']).describe('Todo o solo lo propio');

export const grantedPermissionSchema = z.object({
  code: permissionCodeSchema,
  scope: permissionScopeSchema,
});

export const roleAudienceSchema = z
  .enum(['internal', 'portal'])
  .describe('Aplicación interna o portal');

const roleRefSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
});

/** Permisos propios, para que la web decida qué mostrar. La API decide igual en cada petición. */
export const myPermissionsResponseSchema = z.object({
  roles: z.array(roleRefSchema),
  permissions: z.array(grantedPermissionSchema),
});

export const permissionCatalogResponseSchema = z.object({
  groups: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      module: z.string().describe('Módulo del manual, por ejemplo M01'),
      permissions: z.array(
        z.object({
          code: permissionCodeSchema,
          description: z.string(),
          ownable: z.boolean().describe('Se puede conceder limitado a lo propio'),
        }),
      ),
    }),
  ),
});

export const roleSummarySchema = roleRefSchema.extend({
  description: z.string().nullable(),
  is_system: z.boolean().describe('Rol del sistema: no se edita'),
  audience: roleAudienceSchema,
  permission_count: z.number().int(),
  assigned_users: z.number().int().describe('Personas con el rol vigente'),
  version: z.number().int(),
});

export const roleListResponseSchema = z.object({ data: z.array(roleSummarySchema) });

export const roleDetailResponseSchema = roleSummarySchema.extend({
  permissions: z.array(grantedPermissionSchema),
});

const roleNameSchema = z.string().trim().min(3).max(80).describe('Nombre del rol');
const roleDescriptionSchema = z.string().trim().max(300).nullable().describe('Para qué sirve');
const rolePermissionsSchema = z
  .array(grantedPermissionSchema)
  .min(1)
  .max(400)
  .refine((items) => new Set(items.map((item) => item.code)).size === items.length, {
    message: 'Cada permiso va una sola vez',
  });

export const createRoleRequestSchema = z.strictObject({
  name: roleNameSchema,
  description: roleDescriptionSchema.default(null),
  audience: roleAudienceSchema,
  permissions: rolePermissionsSchema,
});

/** Cambio parcial; la versión va en la cabecera If-Match (numeral 14.1). */
export const updateRoleRequestSchema = z
  .strictObject({
    name: roleNameSchema.optional(),
    description: roleDescriptionSchema.optional(),
    permissions: rolePermissionsSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No hay nada que cambiar' });

export const createdResponseSchema = z.object({ id: z.uuid() });

export type GrantedPermission = z.infer<typeof grantedPermissionSchema>;
export type PermissionScope = z.infer<typeof permissionScopeSchema>;
export type MyPermissionsResponse = z.infer<typeof myPermissionsResponseSchema>;
export type PermissionCatalogResponse = z.infer<typeof permissionCatalogResponseSchema>;
export type RoleSummary = z.infer<typeof roleSummarySchema>;
export type RoleListResponse = z.infer<typeof roleListResponseSchema>;
export type RoleDetailResponse = z.infer<typeof roleDetailResponseSchema>;
export type CreateRoleRequest = z.infer<typeof createRoleRequestSchema>;
export type UpdateRoleRequest = z.infer<typeof updateRoleRequestSchema>;
export type CreatedResponse = z.infer<typeof createdResponseSchema>;
