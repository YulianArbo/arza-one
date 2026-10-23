import { z } from 'zod';

import { calendarDateSchema, moneySchema, versionSchema } from './common.js';

// Campañas (B22): de dónde llegan los prospectos. Las ve quien ve prospectos y las administra quien
// los edita (decisión del dueño del producto: sin permiso nuevo).

export const CAMPAIGN_CHANNELS = {
  email: 'Correo',
  social: 'Redes sociales',
  event: 'Evento',
  website: 'Sitio web',
  ads: 'Publicidad pagada',
  other: 'Otro',
} as const;

export type CampaignChannel = keyof typeof CAMPAIGN_CHANNELS;

export const campaignChannelSchema = z
  .enum(Object.keys(CAMPAIGN_CHANNELS) as [CampaignChannel, ...CampaignChannel[]])
  .describe('Canal de la campaña');

export const campaignRequestSchema = z
  .strictObject({
    name: z.string().trim().min(3, 'Escriba al menos tres letras.').max(160),
    channel: campaignChannelSchema,
    starts_on: calendarDateSchema.describe('Primer día'),
    ends_on: calendarDateSchema.nullable().default(null).describe('Último día; vacío si sigue'),
    budget: moneySchema.nullable().default(null).describe('Presupuesto en pesos'),
  })
  .refine((campaign) => campaign.ends_on === null || campaign.ends_on >= campaign.starts_on, {
    path: ['ends_on'],
    message: 'El último día no puede ser anterior al primero.',
  });

export const campaignSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  channel: campaignChannelSchema,
  starts_on: calendarDateSchema,
  ends_on: calendarDateSchema.nullable(),
  budget: moneySchema.nullable(),
  leads_count: z.number().int().describe('Prospectos que llegaron por ella'),
  version: versionSchema,
});

export const campaignListResponseSchema = z.object({ data: z.array(campaignSchema) });

export type CampaignRequest = z.infer<typeof campaignRequestSchema>;
export type Campaign = z.infer<typeof campaignSchema>;
export type CampaignListResponse = z.infer<typeof campaignListResponseSchema>;
