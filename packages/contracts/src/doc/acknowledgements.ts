import { z } from 'zod';

// Contratos de la constancia de lectura (M03, B19; ficha 17.4 y numeral 18.2, paso 7): al publicar
// una versión se pide la lectura a las personas de los cargos destinatarios (los cargos vinculados
// con «Aplica a»), y cada una confirma que leyó la versión vigente.

const dateTime = z.iso.datetime({ offset: true });

const reader = z.object({
  user: z.object({ id: z.uuid(), name: z.string() }),
  requested_at: dateTime.nullable().describe('Cuándo se le pidió; null si confirmó por su cuenta'),
  acknowledged_at: dateTime.nullable().describe('Cuándo confirmó; null si falta'),
});

export const acknowledgementReportSchema = z.object({
  document_id: z.uuid(),
  version: z.object({ id: z.uuid(), label: z.string() }).nullable().describe('Versión vigente'),
  mine: z
    .object({ requested_at: dateTime.nullable(), acknowledged_at: dateTime.nullable() })
    .nullable()
    .describe('La constancia de quien consulta'),
  can_acknowledge: z.boolean().describe('Puede confirmar la lectura de la versión vigente'),
  totals: z.object({
    requested: z.number().int().nonnegative(),
    acknowledged: z.number().int().nonnegative(),
  }),
  positions: z
    .array(
      z.object({
        position: z.object({ id: z.uuid(), name: z.string() }).nullable(),
        readers: z.array(reader),
      }),
    )
    .describe('Por cargo; vacío para quien no puede ver el informe'),
});

export const acknowledgementRequestResponseSchema = z.object({
  requested: z.number().int().nonnegative().describe('Personas a las que se les pidió la lectura'),
});

export type AcknowledgementReport = z.infer<typeof acknowledgementReportSchema>;
export type AcknowledgementRequestResponse = z.infer<typeof acknowledgementRequestResponseSchema>;
