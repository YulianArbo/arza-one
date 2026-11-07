import { z } from 'zod';

import { requiredText } from '../contract/common.js';
import { calendarDateSchema, dateTimeSchema } from '../crm/common.js';
import {
  ticketCategorySchema,
  ticketPrioritySchema,
  ticketStatusSchema,
} from '../service/common.js';
import { kbCategorySchema } from '../service/knowledge.js';
import { pqrsfStatusSchema, pqrsfTypeSchema } from '../service/pqrsf.js';

// Soporte en el portal (B30, decisiones 3 y 7): tiquetes, PQRSF y artículos de ayuda para clientes.
// El cliente ve solo los mensajes públicos; las notas internas del equipo nunca salen aquí.

export const portalTicketRequestSchema = z.strictObject({
  subject: requiredText(3, 160, 'Escriba un asunto corto.'),
  description: requiredText(10, 8000, 'Cuéntenos con detalle qué pasa (al menos 10 letras).'),
  category: ticketCategorySchema,
  priority: ticketPrioritySchema,
  project_id: z.uuid().nullable().default(null).describe('Proyecto relacionado, de los suyos'),
});

export const portalTicketSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  subject: z.string(),
  category: ticketCategorySchema,
  priority: ticketPrioritySchema,
  status: ticketStatusSchema,
  project: z.string().nullable().describe('Nombre del proyecto'),
  requester: z.string().nullable().describe('Quien lo pidió en su empresa'),
  created_at: dateTimeSchema,
  updated_at: dateTimeSchema,
});

export const portalTicketListSchema = z.object({ data: z.array(portalTicketSummarySchema) });

export const portalTicketMessageSchema = z.object({
  id: z.uuid(),
  author: z.string().describe('Su nombre, o «Equipo de soporte» si responde la empresa'),
  from_client: z.boolean(),
  body: z.string(),
  created_at: dateTimeSchema,
});

export const portalTicketDetailSchema = portalTicketSummarySchema.extend({
  description: z.string(),
  resolution: z.string().nullable(),
  messages: z.array(portalTicketMessageSchema),
  can_reply: z.boolean(),
});

export const portalTicketReplySchema = z.strictObject({
  body: requiredText(1, 8000, 'Escriba el mensaje.'),
});

export const portalPqrsfRequestSchema = z.strictObject({
  type: pqrsfTypeSchema,
  subject: requiredText(3, 160, 'Escriba un asunto corto.'),
  description: requiredText(10, 8000, 'Cuéntenos con detalle (al menos 10 letras).'),
});

export const portalPqrsfSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  type: pqrsfTypeSchema,
  subject: z.string(),
  status: pqrsfStatusSchema,
  received_at: dateTimeSchema,
  due_on: calendarDateSchema,
  responded_at: dateTimeSchema.nullable(),
  response: z.string().nullable().describe('La respuesta, cuando ya se envió'),
});

export const portalPqrsfListSchema = z.object({ data: z.array(portalPqrsfSchema) });

export const portalPqrsfFiledSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  due_on: calendarDateSchema,
});

export const portalArticleSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  summary: z.string(),
  category: kbCategorySchema,
  published_at: dateTimeSchema.nullable(),
});

export const portalArticleListSchema = z.object({ data: z.array(portalArticleSummarySchema) });

export const portalArticleSchema = portalArticleSummarySchema.extend({ body: z.string() });

export const portalArticleQuerySchema = z.strictObject({
  q: z.string().trim().min(2).max(120).optional().describe('Busca en título, resumen y contenido'),
});

export type PortalTicketRequest = z.infer<typeof portalTicketRequestSchema>;
export type PortalTicketSummary = z.infer<typeof portalTicketSummarySchema>;
export type PortalTicketList = z.infer<typeof portalTicketListSchema>;
export type PortalTicketMessage = z.infer<typeof portalTicketMessageSchema>;
export type PortalTicketDetail = z.infer<typeof portalTicketDetailSchema>;
export type PortalTicketReply = z.infer<typeof portalTicketReplySchema>;
export type PortalPqrsfRequest = z.infer<typeof portalPqrsfRequestSchema>;
export type PortalPqrsf = z.infer<typeof portalPqrsfSchema>;
export type PortalPqrsfList = z.infer<typeof portalPqrsfListSchema>;
export type PortalPqrsfFiled = z.infer<typeof portalPqrsfFiledSchema>;
export type PortalArticleSummary = z.infer<typeof portalArticleSummarySchema>;
export type PortalArticleList = z.infer<typeof portalArticleListSchema>;
export type PortalArticle = z.infer<typeof portalArticleSchema>;
export type PortalArticleQuery = z.infer<typeof portalArticleQuerySchema>;
