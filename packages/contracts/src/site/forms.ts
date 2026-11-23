import { z } from 'zod';

import { siteDateTimeSchema, siteEnumOf, siteIdSchema } from './common.js';

// Formularios del sitio (B41, ficha 17.18): contacto y cotización. Los dos crean el prospecto en
// Comercial con su tarea y su autorización (decisión 7). La casilla de autorización nunca viene
// marcada y sin ella no se guarda nada. El campo «nickname» es una trampa para robots: las
// personas no lo ven y debe llegar vacío (decisión 8).

export const SITE_FORMS = { contact: 'Contacto', quote: 'Solicitud de cotización' } as const;
export type SiteFormKey = keyof typeof SITE_FORMS;
export const siteFormKeySchema = siteEnumOf(SITE_FORMS).describe('Formulario');

/** Servicios que se pueden cotizar desde el sitio. */
export const SITE_SERVICES = {
  custom_software: 'Software a la medida',
  digital_consulting: 'Consultoría digital',
  cloud: 'Infraestructura cloud',
  saas: 'Soluciones SaaS',
  support: 'Soporte posventa',
} as const;
export type SiteService = keyof typeof SITE_SERVICES;

export const QUOTE_TIMEFRAMES = {
  now: 'Lo antes posible',
  quarter: 'En los próximos tres meses',
  later: 'Más adelante',
  exploring: 'Solo estoy explorando',
} as const;
export type QuoteTimeframe = keyof typeof QUOTE_TIMEFRAMES;

const nameField = z.string().trim().min(2, 'Escriba al menos dos letras.').max(80);
const phoneField = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ]{7,20}$/u, 'Escriba solo números, con el indicativo si es del exterior.')
  .nullable()
  .default(null);

const visitorFields = {
  first_name: nameField.describe('Nombres'),
  last_name: nameField.describe('Apellidos'),
  email: z.email('Escriba un correo válido.').max(160),
  phone: phoneField,
  company: z.string().trim().max(160).nullable().default(null).describe('Empresa, si aplica'),
  notice_id: siteIdSchema.describe('Versión del texto de autorización que se mostró'),
  accept_privacy: z.literal(true, 'Marque la casilla de autorización para continuar.'),
  nickname: z.string().max(200).default('').describe('No lo llene: es una trampa para robots'),
};

export const contactFormSchema = z.strictObject({
  ...visitorFields,
  message: z.string().trim().min(10, 'Cuéntenos un poco más.').max(1800),
});

export const quoteFormSchema = z.strictObject({
  ...visitorFields,
  service: siteEnumOf(SITE_SERVICES).describe('Servicio que le interesa'),
  description: z.string().trim().min(20, 'Cuéntenos un poco más del proyecto.').max(1800),
  timeframe: siteEnumOf(QUOTE_TIMEFRAMES).describe('Cuándo lo necesita'),
});

/** El aviso de autorización que acompaña a los formularios (numeral 20.2). */
export const formNoticeSchema = z.object({
  id: siteIdSchema,
  title: z.string(),
  body: z.string(),
  version_number: z.number().int().positive(),
  purposes: z.array(z.string()),
});
export const publicFormInfoSchema = z.object({
  available: z.boolean().describe('Falso si el sitio no está configurado o no hay aviso'),
  notice: formNoticeSchema.nullable(),
});

export const formReceiptSchema = z.object({
  code: z.string().describe('Referencia de la solicitud: FRM-AAAA-NNNN'),
  received_at: siteDateTimeSchema,
});

export const submissionSchema = z.object({
  id: siteIdSchema,
  code: z.string(),
  form_key: siteFormKeySchema,
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  company: z.string().nullable(),
  detail: z.string().describe('Mensaje o descripción del proyecto'),
  service: z.string().nullable(),
  timeframe: z.string().nullable(),
  received_at: siteDateTimeSchema,
  notice_version: z.number().int().positive(),
  lead: z.object({ id: siteIdSchema, code: z.string() }).nullable(),
  ack_sent_at: siteDateTimeSchema.nullable(),
});
export const submissionListResponseSchema = z.object({ data: z.array(submissionSchema) });
export const submissionQuerySchema = z.strictObject({ form_key: siteFormKeySchema.optional() });

/** Baja de comunicaciones comerciales en un clic (decisión 9). La llave va en el cuerpo. */
export const unsubscribeRequestSchema = z.strictObject({
  token: z.string().min(20).max(200),
});
export const unsubscribeResultSchema = z.object({
  email: z.string().describe('Correo con la parte local oculta'),
  already: z.boolean().describe('Ya se había dado de baja'),
});
export const unsubscribeSchema = z.object({
  id: siteIdSchema,
  email: z.string(),
  source: z.string(),
  unsubscribed_at: siteDateTimeSchema,
});
export const unsubscribeListResponseSchema = z.object({ data: z.array(unsubscribeSchema) });

/** El correo con la parte local oculta: m•••@dominio.com. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '•••';
  return `${email.slice(0, 1)}•••${email.slice(at)}`;
}

export type ContactForm = z.infer<typeof contactFormSchema>;
export type QuoteForm = z.infer<typeof quoteFormSchema>;
export type FormNotice = z.infer<typeof formNoticeSchema>;
export type PublicFormInfo = z.infer<typeof publicFormInfoSchema>;
export type FormReceipt = z.infer<typeof formReceiptSchema>;
export type Submission = z.infer<typeof submissionSchema>;
export type UnsubscribeRequest = z.infer<typeof unsubscribeRequestSchema>;
export type UnsubscribeResult = z.infer<typeof unsubscribeResultSchema>;
export type Unsubscribe = z.infer<typeof unsubscribeSchema>;
