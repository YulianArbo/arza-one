import { z } from 'zod';

import { permissionCodeSchema } from './access.js';
import { emailSchema, userKindSchema } from './auth.js';

// Contratos de la administración de usuarios, las delegaciones y la revisión de accesos (B10).

const dateTime = z.iso.datetime({ offset: true });

export const userStatusSchema = z
  .enum(['invited', 'active', 'locked', 'inactive'])
  .describe('Invitado, activo, bloqueado o inactivo');

const assignedRoleSchema = z.object({
  code: z.string(),
  name: z.string(),
  valid_until: dateTime.nullable(),
});

export const userSummarySchema = z.object({
  id: z.uuid(),
  email: z.email(),
  display_name: z.string().nullable(),
  kind: userKindSchema,
  status: userStatusSchema,
  last_login_at: dateTime.nullable(),
  roles: z.array(assignedRoleSchema).describe('Roles vigentes'),
});

export const userListQuerySchema = z.strictObject({
  q: z.string().trim().max(120).optional().describe('Busca en el nombre y el correo'),
  status: userStatusSchema.optional(),
  kind: userKindSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional().describe('next_cursor de la página anterior'),
});

export const userListResponseSchema = z.object({
  data: z.array(userSummarySchema),
  next_cursor: z.uuid().nullable(),
});

const personRefSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  display_name: z.string().nullable(),
});

export const roleAssignmentSchema = z.object({
  id: z.uuid(),
  role: z.object({ id: z.uuid(), code: z.string(), name: z.string() }),
  valid_from: dateTime,
  valid_until: dateTime.nullable(),
  assigned_by: personRefSchema.nullable().describe('Null si lo asignó el sistema'),
});

/** Datos de seguridad de la cuenta: solo los ve quien puede administrarlos (numeral 15.5). */
export const userSecuritySchema = z.object({
  second_factor: z.boolean().describe('Tiene segundo factor configurado'),
  mfa_required: z.boolean(),
  active_sessions: z.number().int(),
  locked_until: dateTime.nullable().describe('Bloqueo temporal por intentos fallidos'),
});

export const userDetailResponseSchema = userSummarySchema.extend({
  created_at: dateTime,
  assignments: z.array(roleAssignmentSchema),
  security: userSecuritySchema.nullable().describe('Null si su rol no puede verlos'),
});

export const inviteUserRequestSchema = z.strictObject({
  email: emailSchema,
  display_name: z.string().trim().min(2).max(120).nullable().default(null),
  kind: userKindSchema,
  role_ids: z.array(z.uuid()).max(20).default([]).describe('Roles además del automático'),
});

export const inviteUserResponseSchema = z.object({
  id: z.uuid(),
  outcome: z.enum(['invited', 'resent']),
});

export const assignRoleRequestSchema = z.strictObject({
  role_id: z.uuid(),
  valid_until: dateTime.nullable().default(null).describe('Vence; null si no vence'),
});

export const delegationStatusSchema = z
  .enum(['scheduled', 'active', 'ended', 'revoked'])
  .describe('Programada, vigente, terminada o retirada');

export const delegationSchema = z.object({
  id: z.uuid(),
  from_user: personRefSchema,
  to_user: personRefSchema,
  starts_at: dateTime,
  ends_at: dateTime,
  permissions: z.array(permissionCodeSchema),
  reason: z.string(),
  status: delegationStatusSchema,
  created_at: dateTime,
});

export const delegationListResponseSchema = z.object({ data: z.array(delegationSchema) });

export const createDelegationRequestSchema = z.strictObject({
  from_user_id: z.uuid().optional().describe('Quien delega; si falta, usted'),
  to_user_id: z.uuid(),
  starts_at: dateTime,
  ends_at: dateTime,
  permissions: z.array(permissionCodeSchema).min(1).max(100),
  reason: z.string().trim().min(5).max(300).describe('Motivo, por ejemplo vacaciones'),
});

export const accessReviewResponseSchema = z.object({
  generated_at: dateTime,
  unused_days: z.number().int().describe('Días sin ingresar para contar una cuenta sin uso'),
  totals: z.object({
    users: z.number().int(),
    active: z.number().int(),
    unused: z.number().int(),
    without_roles: z.number().int(),
  }),
  users: z.array(
    userSummarySchema.extend({
      unused: z.boolean().describe('Cuenta activa sin ingresar en los últimos días indicados'),
    }),
  ),
});

export type UserStatus = z.infer<typeof userStatusSchema>;
export type UserSummary = z.infer<typeof userSummarySchema>;
export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type UserListResponse = z.infer<typeof userListResponseSchema>;
export type RoleAssignment = z.infer<typeof roleAssignmentSchema>;
export type UserSecurity = z.infer<typeof userSecuritySchema>;
export type UserDetailResponse = z.infer<typeof userDetailResponseSchema>;
export type InviteUserRequest = z.infer<typeof inviteUserRequestSchema>;
export type InviteUserResponse = z.infer<typeof inviteUserResponseSchema>;
export type AssignRoleRequest = z.infer<typeof assignRoleRequestSchema>;
export type DelegationStatus = z.infer<typeof delegationStatusSchema>;
export type Delegation = z.infer<typeof delegationSchema>;
export type DelegationListResponse = z.infer<typeof delegationListResponseSchema>;
export type CreateDelegationRequest = z.infer<typeof createDelegationRequestSchema>;
export type AccessReviewResponse = z.infer<typeof accessReviewResponseSchema>;
