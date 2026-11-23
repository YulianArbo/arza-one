import { z } from 'zod';

import { COOKIE_CATEGORIES, type CookieCategory } from '../site/cookies.js';

// Consulta e informe de las elecciones de cookies de los visitantes del sitio (B42; B41,
// decisión 4; numeral 20.4). Se conservan tres años y luego se borran (decisión 10).

const dateTime = z.iso.datetime({ offset: true });
const calendarDate = z.iso.date().describe('Fecha de calendario AAAA-MM-DD');

export const COOKIE_RETENTION_YEARS = 3;

/** Los formularios del sitio se vuelven anónimos a los dos años (decisión 10). */
export const SITE_FORM_RETENTION_YEARS = 2;

const cookieCategorySchema = z.enum(
  Object.keys(COOKIE_CATEGORIES) as [CookieCategory, ...CookieCategory[]],
);

export const cookieConsentQuerySchema = z
  .object({
    from: calendarDate.describe('Desde (incluido)'),
    to: calendarDate.describe('Hasta (incluido)'),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    cursor: z.uuid().optional(),
  })
  .refine((query) => query.from <= query.to, {
    message: 'La fecha inicial no puede ser posterior a la final.',
    path: ['to'],
  });

export type CookieConsentQuery = z.infer<typeof cookieConsentQuerySchema>;

export const cookieConsentRecordSchema = z.object({
  id: z.uuid(),
  decided_at: dateTime,
  policy_version: z.number().int(),
  categories: z.array(cookieCategorySchema),
  ip_truncated: z.string().nullable(),
  visitor: z.string().describe('Primeros caracteres del identificador aleatorio del navegador'),
});

export type CookieConsentRecord = z.infer<typeof cookieConsentRecordSchema>;

export const cookieConsentListResponseSchema = z.object({
  data: z.array(cookieConsentRecordSchema),
  next_cursor: z.uuid().nullable(),
});

export type CookieConsentListResponse = z.infer<typeof cookieConsentListResponseSchema>;

export const cookieReportSchema = z.object({
  from: calendarDate,
  to: calendarDate,
  total: z.number().int(),
  only_necessary: z.number().int().describe('Rechazaron todas las no necesarias'),
  by_category: z.array(z.object({ category: cookieCategorySchema, count: z.number().int() })),
  by_version: z.array(z.object({ policy_version: z.number().int(), count: z.number().int() })),
});

export type CookieReport = z.infer<typeof cookieReportSchema>;
