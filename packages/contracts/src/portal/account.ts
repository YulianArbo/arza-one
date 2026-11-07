import { z } from 'zod';

import { requiredText } from '../contract/common.js';
import { calendarDateSchema, dateTimeSchema, versionSchema } from '../crm/common.js';
import { emailSchema } from '../iam/auth.js';
import { portalRoleSchema } from './common.js';

// Cuenta del cliente en el portal (B30, ficha 17.10): términos del primer ingreso, usuarios de su
// empresa (solo el administrador del cliente), sus datos y su copia descargable, y el inicio.

// Términos de uso y política de privacidad (decisión 8) -------------------------------------------

export const portalTermsDocumentSchema = z.object({
  id: z.uuid(),
  key: z.enum(['portal_terms', 'privacy_policy']),
  title: z.string(),
  body: z.string(),
  version_number: z.number().int(),
});

export const portalTermsSchema = z.object({
  status: z
    .enum(['accepted', 'pending', 'unavailable'])
    .describe('unavailable: aún no hay términos publicados y el portal no se puede usar'),
  documents: z.array(portalTermsDocumentSchema),
  accepted_at: dateTimeSchema.nullable(),
});

export const acceptPortalTermsRequestSchema = z.strictObject({
  notice_ids: z.array(z.uuid()).min(1).max(5).describe('Las versiones que leyó y acepta'),
});

// Usuarios de la empresa cliente --------------------------------------------------------------

export const PORTAL_USER_STATUSES = {
  invited: 'Invitado',
  active: 'Activo',
  locked: 'Bloqueado',
  inactive: 'Inactivo',
} as const;

export const portalUserStatusSchema = z.enum(['invited', 'active', 'locked', 'inactive']);

export const portalUserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  role: portalRoleSchema,
  status: portalUserStatusSchema,
  last_login_at: dateTimeSchema.nullable(),
  project_ids: z.array(z.uuid()).describe('Proyectos asignados (solo cuenta para el usuario)'),
  is_me: z.boolean(),
  version: versionSchema,
});

export const portalUserListSchema = z.object({
  data: z.array(portalUserSchema),
  projects: z
    .array(z.object({ id: z.uuid(), code: z.string(), name: z.string() }))
    .describe('Proyectos de la empresa que se pueden asignar'),
});

export const invitePortalUserRequestSchema = z.strictObject({
  email: emailSchema,
  display_name: requiredText(3, 120, 'Escriba el nombre de la persona.'),
  role: portalRoleSchema,
});

export const updatePortalUserRequestSchema = z.strictObject({
  role: portalRoleSchema,
  active: z.boolean().describe('false desactiva la cuenta y cierra sus sesiones'),
});

export const portalUserProjectsRequestSchema = z.strictObject({
  project_ids: z.array(z.uuid()).max(200),
});

// Mis datos -------------------------------------------------------------------------------------

export const portalMyDataSchema = z.object({
  display_name: z.string().nullable(),
  email: z.string(),
  company: z.string().nullable(),
  role: portalRoleSchema.nullable(),
  second_factor: z.boolean(),
  created_at: dateTimeSchema,
  last_login_at: dateTimeSchema.nullable(),
  terms_accepted_at: dateTimeSchema.nullable(),
  version: versionSchema,
});

export const updatePortalMyDataRequestSchema = z.strictObject({
  display_name: requiredText(3, 120, 'Escriba su nombre.'),
});

/** Copia de lo que la plataforma guarda de la persona (Ley 1581, art. 8): sin secretos. */
export const portalDataExportSchema = z.object({
  generated_at: dateTimeSchema,
  account: portalMyDataSchema.omit({ version: true }),
  terms: z.array(
    z.object({ title: z.string(), version_number: z.number().int(), accepted_at: dateTimeSchema }),
  ),
  sessions: z.array(
    z.object({
      started_at: dateTimeSchema,
      ip: z.string().nullable(),
      device: z.string().nullable(),
    }),
  ),
  tickets: z.array(z.object({ code: z.string(), subject: z.string(), created_at: dateTimeSchema })),
  pqrsf: z.array(z.object({ code: z.string(), subject: z.string(), received_at: dateTimeSchema })),
});

// Inicio ---------------------------------------------------------------------------------------

export const portalHomeSchema = z.object({
  company: z.string(),
  projects: z.number().int().describe('Proyectos que usted ve'),
  next_milestones: z.array(
    z.object({
      project_id: z.uuid(),
      project: z.string(),
      name: z.string(),
      due_on: calendarDateSchema,
    }),
  ),
  pending: z.object({
    signatures: z.number().int().describe('Documentos que esperan su firma'),
    approvals: z.number().int().describe('Actas de entrega que esperan su respuesta'),
    open_tickets: z.number().int(),
    waiting_tickets: z.number().int().describe('Tiquetes que esperan su respuesta'),
  }),
});

// Documentos compartidos (decisión 5) ---------------------------------------------------------

export const portalDocumentKindSchema = z.enum(['contract', 'amendment', 'acceptance', 'shared']);

export type PortalDocumentKind = z.infer<typeof portalDocumentKindSchema>;

export const PORTAL_DOCUMENT_LABELS: Readonly<Record<PortalDocumentKind, string>> = {
  contract: 'Contrato firmado',
  amendment: 'Otrosí firmado',
  acceptance: 'Acta de entrega firmada',
  shared: 'Compartido por el equipo',
};

export const portalDocumentSchema = z.object({
  id: z.uuid(),
  kind: portalDocumentKindSchema,
  title: z.string(),
  code: z.string().nullable(),
  project: z.string().nullable(),
  dated_at: dateTimeSchema,
});

export const portalDocumentListSchema = z.object({ data: z.array(portalDocumentSchema) });

export type PortalTermsDocument = z.infer<typeof portalTermsDocumentSchema>;
export type PortalTerms = z.infer<typeof portalTermsSchema>;
export type AcceptPortalTermsRequest = z.infer<typeof acceptPortalTermsRequestSchema>;
export type PortalUserStatus = z.infer<typeof portalUserStatusSchema>;
export type PortalUser = z.infer<typeof portalUserSchema>;
export type PortalUserList = z.infer<typeof portalUserListSchema>;
export type InvitePortalUserRequest = z.infer<typeof invitePortalUserRequestSchema>;
export type UpdatePortalUserRequest = z.infer<typeof updatePortalUserRequestSchema>;
export type PortalUserProjectsRequest = z.infer<typeof portalUserProjectsRequestSchema>;
export type PortalMyData = z.infer<typeof portalMyDataSchema>;
export type UpdatePortalMyDataRequest = z.infer<typeof updatePortalMyDataRequestSchema>;
export type PortalDataExport = z.infer<typeof portalDataExportSchema>;
export type PortalHome = z.infer<typeof portalHomeSchema>;
export type PortalDocument = z.infer<typeof portalDocumentSchema>;
export type PortalDocumentList = z.infer<typeof portalDocumentListSchema>;
