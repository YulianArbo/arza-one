import { z } from 'zod';

import {
  calendarDateSchema,
  dateTimeSchema,
  personRefSchema,
  versionSchema,
} from '../crm/common.js';
import { optionalText, requiredText } from '../contract/common.js';
import {
  ACCEPTANCE_RULES,
  acceptanceStatusSchema,
  deliverableStatusSchema,
  deliveryEnvironmentSchema,
} from './common.js';

// Entregables y actas de entrega (B27, ficha 17.8). El equipo prepara el entregable; el líder del
// proyecto o un Líder técnico lo entrega: la plataforma llena el Acta de Entrega Técnica FT-TEC-001
// y la envía a firmar a la persona del cliente (enlace y código, numeral 19.1). Si firma, queda
// aceptado y su hito puede quedar listo para facturar; si la rechaza, queda devuelto.

const httpsUrl = z
  .url({ protocol: /^https$/u, error: 'Escriba el enlace completo, que empiece por https://' })
  .max(500);

export const deliverableRequestSchema = z.strictObject({
  name: requiredText(3, 160, 'Escriba el nombre del entregable.'),
  description: optionalText(2000).describe('Qué se entrega'),
  version_label: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .nullable()
    .default(null)
    .describe('Versión que se entrega, como 1.2.0'),
  milestone_id: z.uuid().nullable().default(null).describe('Hito al que pertenece'),
  evidence_url: httpsUrl
    .nullable()
    .default(null)
    .describe('Dónde está: repositorio, entorno o documento'),
});

export const deliverRequestSchema = z.strictObject({
  signer_id: z.uuid().describe('Firmante autorizado del cliente, registrado en Terceros'),
  environment: deliveryEnvironmentSchema,
  pending_note: optionalText(2000).describe('Pendientes y fechas de solución'),
  message: optionalText(1000).describe('Mensaje para el cliente en el correo'),
});

export const acceptanceSchema = z.object({
  id: z.uuid(),
  status: acceptanceStatusSchema,
  record_code: z.string().nullable().describe('Código del acta FT-TEC-001'),
  envelope_code: z.string().nullable().describe('Código del proceso de firma FE-AAAA-NNNN'),
  signer_name: z.string(),
  delivered_by: personRefSchema.nullable(),
  delivered_at: dateTimeSchema,
  respond_by: calendarDateSchema.describe('Último día para que el cliente responda'),
  answered_at: dateTimeSchema.nullable(),
  client_note: z.string().nullable().describe('Motivo del cliente al devolver'),
  signed_pdf: z.boolean().describe('Ya se puede descargar el acta firmada'),
});

export const deliverableSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  version_label: z.string().nullable(),
  milestone: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  evidence_url: z.string().nullable(),
  status: deliverableStatusSchema,
  acceptance: acceptanceSchema.nullable().describe('La última entrega y su acta'),
  version: versionSchema,
});

export const deliverableListResponseSchema = z.object({ data: z.array(deliverableSchema) });

/** Quién puede recibir el acta por el cliente y el plazo para responder. */
export const deliveryOptionsSchema = z.object({
  signers: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      ready: z.boolean().describe('Tiene correo y documento registrados en Terceros'),
    }),
  ),
  respond_days: z.number().int().min(ACCEPTANCE_RULES.minDays).max(ACCEPTANCE_RULES.maxDays),
  tacit_acceptance: z.boolean(),
  form_ready: z.boolean().describe('El formato FT-TEC-001 está publicado en la empresa'),
});

export type DeliverableRequest = z.infer<typeof deliverableRequestSchema>;
export type DeliverRequest = z.infer<typeof deliverRequestSchema>;
export type ProjectAcceptance = z.infer<typeof acceptanceSchema>;
export type Deliverable = z.infer<typeof deliverableSchema>;
export type DeliverableListResponse = z.infer<typeof deliverableListResponseSchema>;
export type DeliveryOptions = z.infer<typeof deliveryOptionsSchema>;
