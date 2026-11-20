import { z } from 'zod';

import { calendarDateSchema } from './calendar.js';

// Comunicados del acceso (B36A): Administración los carga con vigencia de una fecha a otra y la
// pantalla de acceso, sin sesión, muestra los vigentes según la pestaña elegida.

/** Para quién es cada comunicado; la pestaña del acceso decide cuáles se ven. */
export const ANNOUNCEMENT_AUDIENCES = {
  staff: 'Personal',
  clients: 'Clientes',
  both: 'Personal y clientes',
} as const;

export type AnnouncementAudience = keyof typeof ANNOUNCEMENT_AUDIENCES;

export const announcementAudienceSchema = z.enum(['staff', 'clients', 'both']);

/** Estado según las fechas de Colombia: aún no empieza, vigente, ya pasó o terminado a mano. */
export const ANNOUNCEMENT_STATUSES = {
  scheduled: 'Programado',
  active: 'Vigente',
  expired: 'Vencido',
  ended: 'Terminado',
} as const;

export type AnnouncementStatus = keyof typeof ANNOUNCEMENT_STATUSES;

/** Límites que aprobó el dueño: caben en el panel del acceso. */
export const ANNOUNCEMENT_LIMITS = { title: 80, body: 400 } as const;

const httpsUrl = z
  .url({ protocol: /^https$/u, error: 'Escriba el enlace completo, que empiece por https://' })
  .max(500);

export const announcementRequestSchema = z
  .strictObject({
    title: z
      .string()
      .trim()
      .min(3, 'Escriba un título de al menos 3 caracteres.')
      .max(
        ANNOUNCEMENT_LIMITS.title,
        `El título admite hasta ${String(ANNOUNCEMENT_LIMITS.title)} caracteres.`,
      ),
    body: z
      .string()
      .trim()
      .min(3, 'Escriba el texto del comunicado.')
      .max(
        ANNOUNCEMENT_LIMITS.body,
        `El texto admite hasta ${String(ANNOUNCEMENT_LIMITS.body)} caracteres.`,
      ),
    link_url: httpsUrl.nullable().default(null).describe('Enlace opcional para ver más'),
    audience: announcementAudienceSchema,
    starts_on: calendarDateSchema.describe('Primer día en que se ve (hora de Colombia)'),
    ends_on: calendarDateSchema.describe('Último día en que se ve (hora de Colombia)'),
    image_file_id: z.uuid().nullable().default(null).describe('Imagen PNG o JPG ya revisada'),
  })
  .refine((input) => input.ends_on >= input.starts_on, {
    path: ['ends_on'],
    message: 'La fecha de fin debe ser igual o posterior a la de inicio.',
  });

export const announcementSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  link_url: z.string().nullable(),
  audience: announcementAudienceSchema,
  starts_on: calendarDateSchema,
  ends_on: calendarDateSchema,
  image_file_id: z.uuid().nullable(),
  status: z.enum(['scheduled', 'active', 'expired', 'ended']),
  ended_at: z.iso.datetime().nullable(),
  created_at: z.iso.datetime(),
  version: z.number().int().positive().describe('Versión para la cabecera If-Match'),
});

export const announcementListResponseSchema = z.object({ data: z.array(announcementSchema) });

/** Lo que ve cualquier persona en el acceso: sin quién lo creó ni sus fechas internas. */
export const publicAnnouncementSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  link_url: z.string().nullable(),
  has_image: z.boolean(),
});

export const publicAnnouncementListResponseSchema = z.object({
  data: z.array(publicAnnouncementSchema),
});

/** La pestaña del acceso: «Ingreso plataforma» (staff) o «Portal de clientes» (clients). */
export const publicAnnouncementQuerySchema = z.strictObject({
  audience: z.enum(['staff', 'clients']),
});

export type AnnouncementRequest = z.infer<typeof announcementRequestSchema>;
export type AnnouncementRequestInput = z.input<typeof announcementRequestSchema>;
export type Announcement = z.infer<typeof announcementSchema>;
export type AnnouncementListResponse = z.infer<typeof announcementListResponseSchema>;
export type PublicAnnouncement = z.infer<typeof publicAnnouncementSchema>;
export type PublicAnnouncementQuery = z.infer<typeof publicAnnouncementQuerySchema>;
