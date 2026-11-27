import { z } from 'zod';

// Exportación completa de una empresa (B48, decisiones 3 a 5): un archivo ZIP con una hoja CSV
// por tabla, los archivos originales y un índice (manifest.json) con las filas de cada tabla y
// la huella SHA-256 de cada archivo. La pide y la descarga solo la Dirección de la empresa.

export const tenantExportStatusSchema = z
  .enum(['queued', 'running', 'ready', 'failed', 'expired'])
  .describe('En cola, generándose, lista, fallida o vencida');

export const tenantExportSchema = z.object({
  id: z.uuid(),
  status: tenantExportStatusSchema,
  requested_at: z.iso.datetime(),
  ready_at: z.iso.datetime().nullable(),
  expires_at: z.iso.datetime().nullable().describe('Después ya no se puede descargar'),
  size_bytes: z.number().int().nonnegative().nullable(),
  tables: z.number().int().nonnegative().nullable(),
  rows: z.number().int().nonnegative().nullable(),
  files: z.number().int().nonnegative().nullable(),
  manifest_sha256: z.string().nullable().describe('Huella del índice de la exportación'),
});

export const tenantExportListResponseSchema = z.object({ data: z.array(tenantExportSchema) });

export const tenantExportCreatedResponseSchema = z.object({ id: z.uuid() });

/** Tabla del índice: cuántas filas trae y qué columnas se dejaron fuera (decisión 4). */
export interface ExportManifestTable {
  readonly table: string;
  readonly rows: number;
  readonly omitted_columns: readonly string[];
}

export interface ExportManifestFile {
  readonly path: string;
  readonly size_bytes: number;
  readonly sha256: string;
}

export interface ExportManifest {
  readonly tenant_id: string;
  readonly tax_id: string;
  readonly legal_name: string;
  readonly generated_at: string;
  readonly tables: readonly ExportManifestTable[];
  /** Tablas que nunca se exportan, con su porqué. */
  readonly omitted_tables: readonly { readonly table: string; readonly reason: string }[];
  readonly files: readonly ExportManifestFile[];
}

export type TenantExportStatus = z.infer<typeof tenantExportStatusSchema>;
export type TenantExport = z.infer<typeof tenantExportSchema>;
export type TenantExportListResponse = z.infer<typeof tenantExportListResponseSchema>;
export type TenantExportCreatedResponse = z.infer<typeof tenantExportCreatedResponseSchema>;
