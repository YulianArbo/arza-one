import { z } from 'zod';

import { sstDateSchema, sstIdSchema, sstOptionalText, sstRefSchema } from './common.js';

// Entrega de elementos de protección personal (B37, decisión 12; FT-SST-001). Los elementos vienen
// de un catálogo editable; SST registra la entrega y el colaborador confirma que la recibió desde
// «Mi espacio».

export const PPE_CATALOG = 'sst_ppe_items';

export const ppeDeliverySchema = z.object({
  id: sstIdSchema,
  employee: sstRefSchema,
  item: z.string(),
  item_label: z.string(),
  quantity: z.number().int().positive(),
  delivered_on: sstDateSchema,
  delivered_by: sstRefSchema,
  note: z.string().nullable(),
  acknowledged_at: z.iso.datetime({ offset: true }).nullable(),
  version: z.number().int().positive(),
});
export const ppeDeliveryListResponseSchema = z.object({ data: z.array(ppeDeliverySchema) });

export const recordPpeDeliverySchema = z.strictObject({
  employee_id: sstIdSchema,
  item: z.string().trim().min(1).max(20).describe('Código del catálogo de elementos'),
  quantity: z.number().int().min(1).max(100).default(1),
  delivered_on: sstDateSchema,
  note: sstOptionalText(500),
});

export type PpeDelivery = z.infer<typeof ppeDeliverySchema>;
export type RecordPpeDelivery = z.infer<typeof recordPpeDeliverySchema>;
