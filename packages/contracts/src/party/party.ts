import { z } from 'zod';

import { NIT_NUMBER_PATTERN, isValidNit } from './nit.js';

// Contratos de los terceros (M02, B13): ficha única de persona u organización, sus papeles,
// estados y posibles duplicados (numeral 14.3).

const versionField = z.number().int().positive().describe('Versión para la cabecera If-Match');
const calendarDate = z.iso.date().describe('Fecha de calendario AAAA-MM-DD');

/** Códigos estables de los errores de terceros (numeral 14.2). */
export const PARTY_ERROR_CODES = {
  notFound: 'PARTY_NOT_FOUND',
  duplicate: 'PARTY_DUPLICATE',
  kindChange: 'PARTY_KIND_CHANGE',
  catalogValueInvalid: 'PARTY_CATALOG_VALUE_INVALID',
  statusTransitionInvalid: 'PARTY_STATUS_TRANSITION_INVALID',
  contactInvalid: 'PARTY_CONTACT_INVALID',
  sameReviewer: 'PARTY_SAME_REVIEWER',
  reviewClosed: 'PARTY_REVIEW_CLOSED',
  nextReviewInvalid: 'PARTY_NEXT_REVIEW_INVALID',
  mergeInvalid: 'PARTY_MERGE_INVALID',
} as const;

/** Código del tipo de documento para el NIT en el catálogo «identification_types». */
export const NIT_ID_TYPE = 'NIT';

export const partyKindSchema = z
  .enum(['person', 'organization'])
  .describe('Persona u organización');

export const partyStatusSchema = z
  .enum(['prospect', 'active', 'inactive', 'blocked'])
  .describe('Prospecto, activo, inactivo o bloqueado');

export const partyRoleSchema = z
  .enum(['customer', 'supplier', 'employee', 'contact', 'candidate'])
  .describe('Cliente, proveedor, colaborador, contacto o candidato');

/** Cómo se obtuvo la autorización de tratamiento de datos (Ley 1581 de 2012, art. 9). */
export const dataAuthorizationSchema = z
  .enum(['written', 'digital', 'verbal', 'contract'])
  .describe(
    'Documento firmado, formulario o correo, verbal con constancia, o cláusula del contrato',
  );

export type PartyKind = z.infer<typeof partyKindSchema>;
export type PartyStatus = z.infer<typeof partyStatusSchema>;
export type PartyRole = z.infer<typeof partyRoleSchema>;

/**
 * Cambios de estado permitidos (ficha 17.3: prospecto → activo → inactivo → bloqueado). Bloquear
 * exige motivo; desbloquear devuelve el tercero a activo.
 */
export const PARTY_STATUS_TRANSITIONS: Readonly<Record<PartyStatus, readonly PartyStatus[]>> = {
  prospect: ['active', 'inactive', 'blocked'],
  active: ['inactive', 'blocked'],
  inactive: ['active', 'blocked'],
  blocked: ['active'],
};

export function canChangeStatus(from: PartyStatus, to: PartyStatus): boolean {
  return PARTY_STATUS_TRANSITIONS[from].includes(to);
}

const personName = z.string().trim().min(2).max(80);
const organizationName = z.string().trim().min(2).max(160);
const optionalText = (max: number) => z.string().trim().min(1).max(max).nullable().default(null);
const catalogCode = z
  .string()
  .trim()
  .regex(/^[A-Z0-9][A-Z0-9_-]{0,19}$/, 'Opción inválida');

const partyDataFields = {
  kind: partyKindSchema,
  id_type: catalogCode.describe('Código del catálogo «Tipos de documento de identidad»'),
  id_number: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{3,20}$/, 'Escriba solo letras y números, sin puntos ni guiones'),
  check_digit: z.number().int().min(0).max(9).nullable().default(null).describe('Solo el NIT'),
  email: z.email().max(160).nullable().default(null),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ]{7,20}$/, 'Escriba solo números, con el indicativo si es del exterior')
    .nullable()
    .default(null),
  city: optionalText(120),
  address: optionalText(200),
  legal_name: organizationName.nullable().default(null).describe('Razón social; organizaciones'),
  trade_name: organizationName
    .nullable()
    .default(null)
    .describe('Nombre comercial; organizaciones'),
  first_name: personName.nullable().default(null).describe('Nombres; personas'),
  last_name: personName.nullable().default(null).describe('Apellidos; personas'),
  // Todo dato personal con su finalidad y su autorización (ficha 17.3, M18).
  data_purpose: catalogCode
    .nullable()
    .default(null)
    .describe('Personas: código del catálogo «Finalidades del tratamiento»'),
  data_authorization: dataAuthorizationSchema.nullable().default(null).describe('Personas'),
  data_authorized_on: calendarDate.nullable().default(null).describe('Personas: fecha'),
};

type PartyDataInput = z.infer<z.ZodObject<typeof partyDataFields>>;

const REQUIRED_BY_KIND = {
  organization: ['legal_name'],
  person: ['first_name', 'last_name', 'data_purpose', 'data_authorization', 'data_authorized_on'],
} as const satisfies Record<PartyKind, readonly (keyof PartyDataInput)[]>;

const FORBIDDEN_BY_KIND = {
  organization: REQUIRED_BY_KIND.person,
  person: ['legal_name', 'trade_name'],
} as const satisfies Record<PartyKind, readonly (keyof PartyDataInput)[]>;

/** Una organización lleva razón social; una persona, nombres, apellidos y su autorización. */
function checkKindFields(value: PartyDataInput, context: z.RefinementCtx): void {
  for (const field of REQUIRED_BY_KIND[value.kind]) {
    if (value[field] === null) {
      context.addIssue({ code: 'custom', path: [field], message: 'Este dato es obligatorio.' });
    }
  }
  for (const field of FORBIDDEN_BY_KIND[value.kind]) {
    if (value[field] !== null) {
      const message =
        value.kind === 'person'
          ? 'Solo las organizaciones lo llevan.'
          : 'Solo las personas lo llevan.';
      context.addIssue({ code: 'custom', path: [field], message });
    }
  }
}

interface IdentificationInput {
  readonly id_type: string;
  readonly id_number: string;
  readonly check_digit: number | null;
}

/** El NIT lleva su dígito de verificación correcto; los demás documentos no llevan dígito. */
function checkIdentification(value: IdentificationInput, context: z.RefinementCtx): void {
  if (value.id_type !== NIT_ID_TYPE) {
    if (value.check_digit !== null) {
      context.addIssue({
        code: 'custom',
        path: ['check_digit'],
        message: 'Solo el NIT lleva dígito de verificación.',
      });
    }
    return;
  }
  if (!NIT_NUMBER_PATTERN.test(value.id_number)) {
    context.addIssue({
      code: 'custom',
      path: ['id_number'],
      message: 'El NIT lleva de 5 a 15 números, sin el dígito de verificación.',
    });
    return;
  }
  if (value.check_digit === null || !isValidNit(value.id_number, value.check_digit)) {
    context.addIssue({
      code: 'custom',
      path: ['check_digit'],
      message: 'El dígito de verificación no corresponde a ese NIT. Revise el RUT.',
    });
  }
}

function checkParty(value: PartyDataInput, context: z.RefinementCtx): void {
  checkKindFields(value, context);
  checkIdentification(value, context);
}

export const createPartyRequestSchema = z
  .strictObject({
    ...partyDataFields,
    status: z.enum(['prospect', 'active']).default('active'),
    roles: z.array(partyRoleSchema).max(5).default([]),
  })
  .superRefine(checkParty);

/** Edición de los datos; el estado y los papeles cambian por sus propias acciones. */
export const updatePartyRequestSchema = z.strictObject(partyDataFields).superRefine(checkParty);

export const changePartyStatusRequestSchema = z
  .strictObject({
    status: partyStatusSchema,
    reason: z.string().trim().min(5).max(500).nullable().default(null),
  })
  .refine((value) => value.status !== 'blocked' || value.reason !== null, {
    path: ['reason'],
    message: 'Escriba el motivo del bloqueo.',
  });

export const addPartyRoleRequestSchema = z.strictObject({ role: partyRoleSchema });

export const partyRoleParamsSchema = z.strictObject({ id: z.uuid(), role: partyRoleSchema });

export const partySummarySchema = z.object({
  id: z.uuid(),
  kind: partyKindSchema,
  name: z.string().describe('Razón social, o nombres y apellidos'),
  id_type: z.string(),
  id_number: z.string(),
  check_digit: z.number().int().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  status: partyStatusSchema,
  roles: z.array(partyRoleSchema).describe('Papeles vigentes'),
  version: versionField,
});

export const partyRoleRecordSchema = z.object({
  role: partyRoleSchema,
  since: calendarDate,
  is_active: z.boolean().describe('Falso si el papel terminó'),
});

export const dueDiligenceStateSchema = z
  .enum(['none', 'pending', 'approved', 'rejected', 'expired'])
  .describe('Estado del último conocimiento del tercero');

export const partyDetailSchema = partySummarySchema.extend({
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  legal_name: z.string().nullable(),
  trade_name: z.string().nullable(),
  address: z.string().nullable(),
  status_reason: z.string().nullable(),
  data_purpose: z.string().nullable(),
  data_authorization: dataAuthorizationSchema.nullable(),
  data_authorized_on: calendarDate.nullable(),
  role_history: z.array(partyRoleRecordSchema),
  due_diligence: z.object({
    state: dueDiligenceStateSchema,
    next_review_on: calendarDate.nullable(),
  }),
  created_at: z.iso.datetime({ offset: true }),
});

export const partyListQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(120).optional().describe('Busca en nombre, documento y correo'),
  role: partyRoleSchema.optional(),
  status: partyStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional().describe('next_cursor de la página anterior'),
});

export const partyListResponseSchema = z.object({
  data: z.array(partySummarySchema),
  next_cursor: z.uuid().nullable(),
});

/** Datos con los que se buscan posibles duplicados (ficha 17.3). */
export const partySearchQuerySchema = z.strictObject({
  id_number: z.string().trim().toUpperCase().max(20).optional(),
  name: z.string().trim().min(2).max(160).optional(),
  email: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(20).optional(),
  exclude_id: z.uuid().optional().describe('El tercero que se está viendo'),
});

export const duplicateReasonSchema = z
  .enum(['id_number', 'email', 'phone', 'name'])
  .describe('Mismo número de documento, correo, teléfono o nombre');

export const partySearchResponseSchema = z.object({
  data: z.array(z.object({ party: partySummarySchema, reasons: z.array(duplicateReasonSchema) })),
});

export const mergePartiesRequestSchema = z.strictObject({
  duplicate_id: z.uuid().describe('Tercero duplicado que se integra en este y deja de usarse'),
});

export type CreatePartyRequest = z.infer<typeof createPartyRequestSchema>;
export type UpdatePartyRequest = z.infer<typeof updatePartyRequestSchema>;
export type ChangePartyStatusRequest = z.infer<typeof changePartyStatusRequestSchema>;
export type AddPartyRoleRequest = z.infer<typeof addPartyRoleRequestSchema>;
export type PartySummary = z.infer<typeof partySummarySchema>;
export type PartyDetail = z.infer<typeof partyDetailSchema>;
export type DueDiligenceState = z.infer<typeof dueDiligenceStateSchema>;
export type PartyListQuery = z.infer<typeof partyListQuerySchema>;
export type PartyListResponse = z.infer<typeof partyListResponseSchema>;
export type PartySearchQuery = z.infer<typeof partySearchQuerySchema>;
export type DuplicateReason = z.infer<typeof duplicateReasonSchema>;
export type PartySearchResponse = z.infer<typeof partySearchResponseSchema>;
export type MergePartiesRequest = z.infer<typeof mergePartiesRequestSchema>;
export type DataAuthorization = z.infer<typeof dataAuthorizationSchema>;
