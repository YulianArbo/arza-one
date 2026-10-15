import { z } from 'zod';

// Contratos de lo que cuelga de un tercero (M02, B13): contactos y firmantes, cuentas bancarias
// con doble aprobación, conocimiento del tercero y línea de tiempo (numeral 14.3).

const versionField = z.number().int().positive().describe('Versión para la cabecera If-Match');
const dateTime = z.iso.datetime({ offset: true });
const calendarDate = z.iso.date().describe('Fecha de calendario AAAA-MM-DD');

const personRefSchema = z.object({ id: z.uuid(), display_name: z.string().nullable() });
const partyRefSchema = z.object({ id: z.uuid(), name: z.string() });

/** Revisión de un segundo usuario: pendiente, aprobada o rechazada (ficha 17.3). */
const reviewFields = {
  requested_by: personRefSchema.nullable().describe('Quién la registró; vacío si fue el sistema'),
  requested_at: dateTime,
  reviewed_by: personRefSchema.nullable().describe('Quién la aprobó o rechazó'),
  reviewed_at: dateTime.nullable(),
  review_note: z.string().nullable(),
};

export const rejectRequestSchema = z.strictObject({
  note: z.string().trim().min(5).max(500).describe('Motivo del rechazo'),
});

// --- Contactos y firmantes -----------------------------------------------------------------

export const contactSchema = z.object({
  id: z.uuid(),
  organization: partyRefSchema,
  person: partyRefSchema.extend({ email: z.string().nullable(), phone: z.string().nullable() }),
  job_title: z.string().nullable(),
  is_primary: z.boolean().describe('Contacto principal de la organización; solo uno'),
  can_sign: z.boolean().describe('Firmante autorizado'),
  version: versionField,
});

const contactFields = {
  job_title: z.string().trim().min(2).max(120).nullable().default(null),
  is_primary: z.boolean().default(false),
  can_sign: z.boolean().default(false),
};

export const createContactRequestSchema = z.strictObject({
  person_id: z.uuid().describe('Tercero persona que es contacto de esta organización'),
  ...contactFields,
});

export const updateContactRequestSchema = z.strictObject(contactFields);

export const contactListResponseSchema = z.object({
  data: z.array(contactSchema).describe('Contactos de la organización, o donde la persona lo es'),
});

// --- Cuentas bancarias ---------------------------------------------------------------------

export const bankAccountTypeSchema = z
  .enum(['savings', 'checking'])
  .describe('Ahorros o corriente');

export const reviewStatusSchema = z
  .enum(['pending', 'approved', 'rejected'])
  .describe('Pendiente, aprobada o rechazada');

export const bankAccountStatusSchema = z
  .enum(['pending', 'approved', 'rejected', 'replaced'])
  .describe('Pendiente de aprobación, aprobada, rechazada o reemplazada por otra');

export const bankAccountSchema = z.object({
  id: z.uuid(),
  bank: z.string().describe('Código del catálogo «Bancos»'),
  account_type: bankAccountTypeSchema,
  number_masked: z.string().describe('Solo los cuatro últimos dígitos'),
  status: bankAccountStatusSchema,
  replaces_id: z.uuid().nullable().describe('Cuenta que reemplaza al aprobarse'),
  ...reviewFields,
});

export const createBankAccountRequestSchema = z.strictObject({
  bank: z
    .string()
    .trim()
    .regex(/^[A-Z0-9][A-Z0-9_-]{0,19}$/, 'Banco inválido'),
  account_type: bankAccountTypeSchema,
  account_number: z
    .string()
    .trim()
    .regex(/^\d{6,20}$/, 'Escriba solo los números de la cuenta, de 6 a 20'),
  replaces_id: z.uuid().nullable().default(null),
});

export const bankAccountListResponseSchema = z.object({ data: z.array(bankAccountSchema) });

export const revealedBankAccountSchema = z.object({
  account_number: z.string().describe('Número completo; la consulta queda registrada'),
});

// --- Conocimiento del tercero --------------------------------------------------------------

export const riskLevelSchema = z.enum(['low', 'medium', 'high']).describe('Bajo, medio o alto');

export const dueDiligenceSchema = z.object({
  id: z.uuid(),
  risk_level: riskLevelSchema,
  summary: z.string().describe('Lo que se revisó y lo que se encontró'),
  status: reviewStatusSchema,
  next_review_on: calendarDate.nullable().describe('Próxima revisión; se fija al aprobar'),
  ...reviewFields,
});

export const createDueDiligenceRequestSchema = z.strictObject({
  risk_level: riskLevelSchema,
  summary: z.string().trim().min(10).max(4000),
});

export const approveDueDiligenceRequestSchema = z.strictObject({
  next_review_on: calendarDate.nullable().default(null).describe('Vacío: en 12 meses'),
});

export const dueDiligenceListResponseSchema = z.object({
  data: z.array(dueDiligenceSchema).describe('Del más reciente al más antiguo'),
});

// --- Línea de tiempo -----------------------------------------------------------------------

export const timelineQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z
    .string()
    .regex(/^\d{1,18}$/, 'Cursor inválido')
    .optional()
    .describe('next_cursor de la página anterior'),
});

export const timelineEntrySchema = z.object({
  id: z.uuid(),
  occurred_at: dateTime,
  actor_name: z.string().nullable().describe('Quién lo hizo; vacío si fue el sistema'),
  action: z.string().describe('Acción, como «party.contact.create»'),
  entity_type: z.string(),
  changes: z.record(z.string(), z.unknown()),
});

export const timelineResponseSchema = z.object({
  data: z.array(timelineEntrySchema),
  next_cursor: z.string().nullable(),
});

export type RejectRequest = z.infer<typeof rejectRequestSchema>;
export type Contact = z.infer<typeof contactSchema>;
export type CreateContactRequest = z.infer<typeof createContactRequestSchema>;
export type UpdateContactRequest = z.infer<typeof updateContactRequestSchema>;
export type ContactListResponse = z.infer<typeof contactListResponseSchema>;
export type BankAccountType = z.infer<typeof bankAccountTypeSchema>;
export type BankAccount = z.infer<typeof bankAccountSchema>;
export type BankAccountStatus = z.infer<typeof bankAccountStatusSchema>;
export type CreateBankAccountRequest = z.infer<typeof createBankAccountRequestSchema>;
export type BankAccountListResponse = z.infer<typeof bankAccountListResponseSchema>;
export type RevealedBankAccount = z.infer<typeof revealedBankAccountSchema>;
export type RiskLevel = z.infer<typeof riskLevelSchema>;
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;
export type DueDiligence = z.infer<typeof dueDiligenceSchema>;
export type CreateDueDiligenceRequest = z.infer<typeof createDueDiligenceRequestSchema>;
export type ApproveDueDiligenceRequest = z.infer<typeof approveDueDiligenceRequestSchema>;
export type DueDiligenceListResponse = z.infer<typeof dueDiligenceListResponseSchema>;
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;
export type TimelineEntry = z.infer<typeof timelineEntrySchema>;
export type TimelineResponse = z.infer<typeof timelineResponseSchema>;
