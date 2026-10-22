import { z } from 'zod';

import { consentGrantSchema } from '../privacy/consents.js';
import {
  calendarDateSchema,
  crmCatalogCodeSchema,
  dateTimeSchema,
  listLimitSchema,
  moneySchema,
  optionRefSchema,
  optionalNoteSchema,
  personRefSchema,
  versionSchema,
} from './common.js';

// Prospectos (ficha 17.6): nuevo → calificado → convertido o descartado. Todo prospecto guarda la
// autorización de tratamiento y su finalidad; la persona queda como tercero «prospecto» (B13).

export const LEAD_STATUSES = {
  new: 'Nuevo',
  qualified: 'Calificado',
  converted: 'Convertido',
  discarded: 'Descartado',
} as const;

export type LeadStatus = keyof typeof LEAD_STATUSES;

export const leadStatusSchema = z
  .enum(Object.keys(LEAD_STATUSES) as [LeadStatus, ...LeadStatus[]])
  .describe('Nuevo, calificado, convertido o descartado');

/** Cambios permitidos; convertir y descartar cierran el prospecto. */
const LEAD_TRANSITIONS: Readonly<Record<LeadStatus, readonly LeadStatus[]>> = {
  new: ['qualified', 'discarded'],
  qualified: ['converted', 'discarded'],
  converted: [],
  discarded: [],
};

export function canMoveLead(from: LeadStatus, to: LeadStatus): boolean {
  return LEAD_TRANSITIONS[from].includes(to);
}

const name = z.string().trim().min(2, 'Escriba al menos dos letras.').max(80);

/** Persona nueva: nombre y una forma de contactarla. El documento se pide al ganarle (B22). */
export const leadPersonSchema = z
  .strictObject({
    first_name: name.describe('Nombres'),
    last_name: name.describe('Apellidos'),
    email: z.email('Escriba un correo válido.').max(160).nullable().default(null),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ]{7,20}$/u, 'Escriba solo números, con el indicativo si es del exterior')
      .nullable()
      .default(null),
  })
  .refine((person) => person.email !== null || person.phone !== null, {
    path: ['email'],
    message: 'Escriba el correo o el teléfono para poder contactarla.',
  });

const leadFields = {
  company_name: z
    .string()
    .trim()
    .min(2)
    .max(160)
    .nullable()
    .default(null)
    .describe('Empresa que dice representar, si la mencionó'),
  need: z.string().trim().min(3, 'Cuéntenos qué necesita.').max(2000).describe('Necesidad'),
  source: crmCatalogCodeSchema.describe('Código del catálogo «Orígenes de los prospectos»'),
  campaign_id: z.uuid().nullable().default(null),
  owner_id: z.uuid().nullable().default(null).describe('Responsable; por defecto, quien registra'),
};

export const createLeadRequestSchema = z
  .strictObject({
    party_id: z.uuid().nullable().default(null).describe('Persona ya registrada en Terceros'),
    person: leadPersonSchema.nullable().default(null).describe('O los datos de una persona nueva'),
    ...leadFields,
    consent: consentGrantSchema.describe('Autorización de tratamiento y finalidades'),
  })
  .refine((lead) => (lead.party_id === null) !== (lead.person === null), {
    path: ['person'],
    message: 'Elija una persona registrada o escriba los datos de una nueva.',
  });

export const updateLeadRequestSchema = z.strictObject(leadFields);

export const discardLeadRequestSchema = z.strictObject({
  reason: crmCatalogCodeSchema.describe('Código del catálogo «Motivos de descarte»'),
  note: optionalNoteSchema,
});

/** Convertir: nace la oportunidad, a nombre de la persona o de una organización registrada. */
export const convertLeadRequestSchema = z.strictObject({
  party_id: z.uuid().describe('Cliente de la oportunidad: la persona del prospecto u otra'),
  title: z.string().trim().min(3).max(200),
  estimated_value: moneySchema,
  expected_close: calendarDateSchema.describe('Fecha esperada de cierre'),
  owner_id: z.uuid().nullable().default(null),
});

export const leadSummarySchema = z.object({
  id: z.uuid(),
  code: z.string().describe('LEA-AAAA-NNNN'),
  status: leadStatusSchema,
  person: personRefSchema,
  email: z.string().nullable(),
  phone: z.string().nullable(),
  company_name: z.string().nullable(),
  source: optionRefSchema,
  campaign: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  owner: personRefSchema.nullable(),
  created_at: dateTimeSchema,
  version: versionSchema,
});

export const leadDetailSchema = leadSummarySchema.extend({
  need: z.string(),
  consent: z.object({
    id: z.uuid(),
    granted_on: calendarDateSchema,
    purposes: z.array(z.string()),
  }),
  discard_reason: optionRefSchema.nullable(),
  discard_note: z.string().nullable(),
  opportunity: z.object({ id: z.uuid(), code: z.string() }).nullable(),
  qualified_at: dateTimeSchema.nullable(),
  closed_at: dateTimeSchema.nullable(),
});

export const leadListQuerySchema = z.strictObject({
  status: leadStatusSchema.optional(),
  q: z.string().trim().min(1).max(120).optional().describe('Busca en código, nombre y empresa'),
  owner_id: z.uuid().optional(),
  campaign_id: z.uuid().optional(),
  limit: listLimitSchema,
  cursor: z.uuid().optional().describe('next_cursor de la página anterior'),
});

export const leadListResponseSchema = z.object({
  data: z.array(leadSummarySchema),
  next_cursor: z.uuid().nullable(),
});

export type CreateLeadRequest = z.infer<typeof createLeadRequestSchema>;
export type UpdateLeadRequest = z.infer<typeof updateLeadRequestSchema>;
export type DiscardLeadRequest = z.infer<typeof discardLeadRequestSchema>;
export type ConvertLeadRequest = z.infer<typeof convertLeadRequestSchema>;
export type LeadPerson = z.infer<typeof leadPersonSchema>;
export type LeadSummary = z.infer<typeof leadSummarySchema>;
export type LeadDetail = z.infer<typeof leadDetailSchema>;
export type LeadListQuery = z.infer<typeof leadListQuerySchema>;
export type LeadListResponse = z.infer<typeof leadListResponseSchema>;
