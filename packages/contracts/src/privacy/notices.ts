import { z } from 'zod';

// Contratos de los avisos y políticas de privacidad versionados (M18, B17; ficha 17.19). Un texto
// pasa de borrador a publicado y, cuando se publica uno nuevo de la misma clave, a reemplazado. Lo
// publicado no cambia: cada autorización guarda la versión exacta que aceptó el titular.

const dateTime = z.iso.datetime({ offset: true });
const versionField = z.number().int().positive().describe('Versión para la cabecera If-Match');

/** Códigos estables de los errores de privacidad (numeral 14.2). */
export const PRIVACY_ERROR_CODES = {
  noticeNotFound: 'PRIVACY_NOTICE_NOT_FOUND',
  noticeNotEditable: 'PRIVACY_NOTICE_NOT_EDITABLE',
  draftExists: 'PRIVACY_NOTICE_DRAFT_EXISTS',
  noticeNotPublished: 'PRIVACY_NOTICE_NOT_PUBLISHED',
  noticeOutdated: 'PRIVACY_NOTICE_OUTDATED',
  purposeInvalid: 'PRIVACY_PURPOSE_INVALID',
  consentNotFound: 'PRIVACY_CONSENT_NOT_FOUND',
  consentRevoked: 'PRIVACY_CONSENT_REVOKED',
  evidenceInvalid: 'PRIVACY_EVIDENCE_INVALID',
  activityNotFound: 'PRIVACY_ACTIVITY_NOT_FOUND',
  processorNotFound: 'PRIVACY_PROCESSOR_NOT_FOUND',
  processorInvalid: 'PRIVACY_PROCESSOR_INVALID',
} as const;

/**
 * Textos de privacidad (numeral 20.2). Las autorizaciones se escriben según el tipo de titular
 * (FT-DG-003); las demás claves solo informan. «Registro anterior a B17» agrupa las autorizaciones
 * que se tomaron antes de que la plataforma guardara el texto aceptado: no se edita ni se usa.
 */
export const NOTICE_KINDS = {
  privacy_policy: { label: 'Política de tratamiento de datos personales', authorization: false },
  privacy_notice: { label: 'Aviso de privacidad', authorization: false },
  authorization_customer: { label: 'Autorización de clientes', authorization: true },
  authorization_supplier: { label: 'Autorización de proveedores', authorization: true },
  authorization_employee: { label: 'Autorización de colaboradores', authorization: true },
  authorization_candidate: { label: 'Autorización de candidatos', authorization: true },
  authorization_contact: { label: 'Autorización de contactos', authorization: true },
  authorization_prior: { label: 'Registro anterior a B17', authorization: true },
} as const satisfies Record<string, { label: string; authorization: boolean }>;

export type NoticeKey = keyof typeof NOTICE_KINDS;

/** Claves que el Oficial de Protección de Datos redacta y publica. */
export const EDITABLE_NOTICE_KEYS = [
  'privacy_policy',
  'privacy_notice',
  'authorization_customer',
  'authorization_supplier',
  'authorization_employee',
  'authorization_candidate',
  'authorization_contact',
] as const satisfies readonly NoticeKey[];

export const noticeKeySchema = z
  .enum(Object.keys(NOTICE_KINDS) as [NoticeKey, ...NoticeKey[]])
  .describe('Clase de texto');

export const editableNoticeKeySchema = z.enum(EDITABLE_NOTICE_KEYS).describe('Clase de texto');

export type EditableNoticeKey = z.infer<typeof editableNoticeKeySchema>;

export function isAuthorizationNotice(key: NoticeKey): boolean {
  return NOTICE_KINDS[key].authorization;
}

export const noticeStatusSchema = z
  .enum(['draft', 'published', 'replaced'])
  .describe('Borrador, publicado o reemplazado');

export type NoticeStatus = z.infer<typeof noticeStatusSchema>;

/** Código del catálogo «Finalidades del tratamiento» (personal_data_purposes). */
export const purposeCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z0-9][A-Z0-9_-]{0,19}$/, 'Opción inválida');

const purposeList = z
  .array(purposeCodeSchema)
  .max(20)
  .refine((codes) => new Set(codes).size === codes.length, 'Hay finalidades repetidas.');

const noticeTextFields = {
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(50, 'El texto debe tener al menos 50 caracteres.').max(20000),
  purposes: purposeList.describe('Autorizaciones: finalidades que el titular puede aceptar'),
};

interface NoticeText {
  readonly purposes: readonly string[];
}

/** Una autorización ofrece al menos una finalidad; los textos informativos, ninguna. */
function checkPurposes(key: NoticeKey, value: NoticeText, context: z.RefinementCtx): void {
  const authorization = isAuthorizationNotice(key);
  if (authorization && value.purposes.length === 0) {
    const message = 'Elija al menos una finalidad que el titular pueda aceptar.';
    context.addIssue({ code: 'custom', path: ['purposes'], message });
  }
  if (!authorization && value.purposes.length > 0) {
    const message = 'Solo los textos de autorización llevan finalidades.';
    context.addIssue({ code: 'custom', path: ['purposes'], message });
  }
}

export const createNoticeRequestSchema = z
  .strictObject({ key: editableNoticeKeySchema, ...noticeTextFields })
  .superRefine((value, context) => {
    checkPurposes(value.key, value, context);
  });

export type CreateNoticeRequest = z.infer<typeof createNoticeRequestSchema>;

/** Edición del borrador; la clase no cambia, así que la revisión de finalidades la hace el caso. */
export const updateNoticeRequestSchema = z.strictObject(noticeTextFields);

export type UpdateNoticeRequest = z.infer<typeof updateNoticeRequestSchema>;

export const noticeSchema = z.object({
  id: z.uuid(),
  key: noticeKeySchema,
  label: z.string(),
  version_number: z.number().int().positive().describe('1, 2, 3… dentro de la misma clase'),
  title: z.string(),
  body: z.string(),
  purposes: z.array(z.string()),
  status: noticeStatusSchema,
  effective_from: dateTime.nullable().describe('Desde cuándo rige; vacío en borrador'),
  created_at: dateTime,
  version: versionField,
});

export type Notice = z.infer<typeof noticeSchema>;

export const noticeListQuerySchema = z.strictObject({
  key: noticeKeySchema.optional(),
  status: noticeStatusSchema.optional(),
});

export const noticeListResponseSchema = z.object({
  data: z.array(noticeSchema).describe('Por clase y de la versión más nueva a la más vieja'),
});

export type NoticeListResponse = z.infer<typeof noticeListResponseSchema>;
