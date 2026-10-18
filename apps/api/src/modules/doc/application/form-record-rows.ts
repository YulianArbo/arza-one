import { formDataSchema, type FormData, type FormRecordListQuery } from '@arza/contracts';

import type { File, Prisma } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { pdfNotReady } from './doc-messages.js';
import { auditDoc, type DocActor } from './doc-support.js';
import { formDataInvalid, formRecordNotEditable, formRecordNotFound } from './form-messages.js';
import type { RecordRow } from './form-record-views.js';
import { visibleRecords, type FormReader } from './form-support.js';
import { definitionOf } from './form-template-views.js';

// Filas de los registros diligenciados (B20): buscarlos con lo que la persona puede ver, validar
// sus datos con la versión de su formato y dejar su evento de auditoría, sin los valores.

export interface RecordTarget {
  readonly id: string;
  readonly version: number;
}

export function validData(
  row: Pick<RecordRow, 'template'>,
  data: unknown,
  mode: 'draft' | 'final',
): FormData {
  const parsed = formDataSchema(definitionOf(row.template), mode).safeParse(data);
  if (!parsed.success) throw formDataInvalid(parsed.error);
  return parsed.data;
}

export function json(data: FormData): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(data)) as Prisma.InputJsonObject;
}

export async function auditRecord(
  tx: TenantTransaction,
  actor: DocActor,
  action: string,
  changes: Prisma.InputJsonObject & { readonly id: string },
): Promise<void> {
  const { id, ...rest } = changes;
  await auditDoc(tx, actor, { action, entityType: 'doc_form_record', entityId: id, changes: rest });
}

export function listWhere(
  reader: FormReader,
  query: FormRecordListQuery,
): Prisma.DocFormRecordWhereInput {
  const filters: Prisma.DocFormRecordWhereInput[] = [visibleRecords(reader)];
  if (query.template_code !== undefined) filters.push({ template: { code: query.template_code } });
  if (query.status !== undefined) filters.push({ status: query.status });
  if (query.entity_type !== undefined) filters.push({ entityType: query.entity_type });
  if (query.entity_id !== undefined) filters.push({ entityId: query.entity_id });
  return { AND: filters };
}

export async function findVisible(
  tx: TenantTransaction,
  reader: FormReader,
  id: string,
): Promise<RecordRow> {
  const row = await tx.docFormRecord.findFirst({
    where: { AND: [{ id }, visibleRecords(reader)] },
    include: { template: true },
  });
  if (row === null) throw formRecordNotFound();
  return row;
}

export async function ownDraft(
  tx: TenantTransaction,
  reader: FormReader,
  target: RecordTarget,
): Promise<RecordRow> {
  const row = await findVisible(tx, reader, target.id);
  if (row.version !== target.version) throw versionConflict();
  if (row.status !== 'draft' || row.createdBy !== reader.userId) throw formRecordNotEditable();
  return row;
}

/** El registro terminado con su PDF disponible. */
export interface ReadyPdf {
  readonly row: RecordRow;
  readonly file: File;
}

export async function readyPdf(
  tx: TenantTransaction,
  reader: FormReader,
  id: string,
): Promise<ReadyPdf> {
  const row = await findVisible(tx, reader, id);
  const file =
    row.pdfFileId === null
      ? null
      : await tx.file.findFirst({ where: { id: row.pdfFileId, scanStatus: 'available' } });
  if (file === null || row.status !== 'completed') throw pdfNotReady();
  return { row, file };
}
