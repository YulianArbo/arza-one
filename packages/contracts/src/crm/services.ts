import { z } from 'zod';

import { taxKeySchema } from '../finance/tax-parameters.js';
import { moneySchema, versionSchema } from './common.js';

// Portafolio de servicios con sus tarifas (B23, ficha 17.6; crm_services). Cada servicio guarda el
// tipo de impuesto (la clave del parámetro tributario) y no la tarifa: si la tarifa cambia, no hay
// que editar cada servicio. La cotización sí guarda la tarifa que usó (decisión del dueño, B23).

export const SERVICE_UNITS = {
  hour: 'Hora',
  day: 'Día',
  month: 'Mes',
  project: 'Proyecto',
  unit: 'Unidad',
  license: 'Licencia',
} as const;

export type ServiceUnit = keyof typeof SERVICE_UNITS;

export const serviceUnitSchema = z
  .enum(Object.keys(SERVICE_UNITS) as [ServiceUnit, ...ServiceUnit[]])
  .describe('Unidad en que se cobra');

export const serviceRequestSchema = z.strictObject({
  name: z.string().trim().min(3, 'Escriba al menos tres letras.').max(160),
  description: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .default(null)
    .describe('Lo que incluye; sale en la cotización'),
  unit: serviceUnitSchema,
  base_price: moneySchema.describe('Tarifa vigente en pesos, antes de impuestos'),
  tax_key: taxKeySchema.describe('Impuesto que aplica, como IVA_GENERAL'),
  is_active: z.boolean().default(true).describe('Inactivo: ya no se ofrece en cotizaciones nuevas'),
});

export const serviceSchema = z.object({
  id: z.uuid(),
  code: z.string().describe('SRV-NNNN'),
  name: z.string(),
  description: z.string().nullable(),
  unit: serviceUnitSchema,
  base_price: moneySchema,
  tax_key: taxKeySchema,
  tax_label: z.string().describe('Nombre del impuesto'),
  is_active: z.boolean(),
  version: versionSchema,
});

export const serviceListQuerySchema = z.strictObject({
  view: z.enum(['active', 'all']).default('active').describe('Activos o todos'),
  q: z.string().trim().min(1).max(120).optional().describe('Busca en código y nombre'),
});

export const serviceListResponseSchema = z.object({ data: z.array(serviceSchema) });

export type ServiceRequest = z.infer<typeof serviceRequestSchema>;
export type Service = z.infer<typeof serviceSchema>;
export type ServiceListQuery = z.infer<typeof serviceListQuerySchema>;
export type ServiceListResponse = z.infer<typeof serviceListResponseSchema>;
