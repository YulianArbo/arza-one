import {
  formDataSchema,
  formDefinitionSchema,
  formFields,
  type FormEntityType,
} from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { nextBusinessCode } from '../../core/index.js';
import { recordSequenceKey } from '../domain/form-rules.js';
import { auditDoc, type DocActor } from './doc-support.js';
import { completion } from './form-record-flow.js';

// Formatos que otro módulo llena con sus propios datos (B27): el Acta de Entrega Técnica FT-TEC-001
// de cada entrega de un proyecto y la Lista de Revisión de Código FT-TEC-002 de cada revisión. El
// registro queda terminado y el worker genera su PDF con la maqueta institucional. Si Calidad
// cambió los campos del formato, solo se guardan los que siguen existiendo.

/** Lo que el otro módulo entrega para llenar el formato. */
export interface SystemFormInput {
  readonly templateCode: string;
  readonly entityType: FormEntityType;
  readonly entityId: string;
  readonly data: Prisma.InputJsonObject;
}

export interface SystemFormRecord {
  readonly id: string;
  readonly code: string;
}

/** El PDF del registro: pendiente, listo (con su archivo y su huella) o fallido. */
export interface SystemFormPdf {
  readonly status: 'pending' | 'ready' | 'failed';
  readonly fileId: string | null;
  readonly sha256: string | null;
}

/** Solo los campos de la versión publicada, validados como borrador (lo vacío no se rechaza). */
function knownData(definition: unknown, data: Prisma.InputJsonObject): Prisma.InputJsonObject {
  const parsed = formDefinitionSchema.parse(definition);
  const keys = new Set(formFields(parsed).map((field) => field.key));
  const kept = Object.fromEntries(Object.entries(data).filter(([key]) => keys.has(key)));
  return formDataSchema(parsed, 'draft').parse(kept);
}

/** El código del registro: el del formato más su consecutivo, como FT-TEC-001-2026-0001. */
function recordCode(tx: TenantTransaction, templateCode: string, at: Date): Promise<string> {
  return nextBusinessCode(tx, recordSequenceKey(templateCode), at, {
    name: `Registros ${templateCode}`,
    prefix: templateCode,
    padding: 4,
  });
}

/** Llena y termina el formato publicado; null si la empresa no lo tiene publicado. */
export async function recordSystemForm(
  tx: TenantTransaction,
  actor: DocActor,
  input: SystemFormInput,
): Promise<SystemFormRecord | null> {
  const template = await tx.docFormTemplate.findFirst({
    where: { code: input.templateCode, status: 'published', deletedAt: null },
  });
  if (template === null) return null;
  const code = await recordCode(tx, template.code, actor.at);
  const record = await tx.docFormRecord.create({
    data: {
      tenantId: actor.tenantId,
      templateId: template.id,
      templateVersion: template.formVersion,
      code,
      data: knownData(template.definition, input.data),
      classification: template.classification,
      entityType: input.entityType,
      entityId: input.entityId,
      submittedAt: actor.at,
      ...completion(actor.at),
    },
  });
  await auditDoc(tx, actor, {
    action: 'doc.form_record.complete',
    entityType: 'doc_form_record',
    entityId: record.id,
    changes: {
      code,
      template_code: template.code,
      entity_type: input.entityType,
      entity_id: input.entityId,
    },
  });
  return { id: record.id, code };
}

/** ¿El formato está publicado en la empresa? Para avisar antes de intentar llenarlo. */
export async function isFormPublished(
  tx: TenantTransaction,
  templateCode: string,
): Promise<boolean> {
  const count = await tx.docFormTemplate.count({
    where: { code: templateCode, status: 'published', deletedAt: null },
  });
  return count > 0;
}

/** El estado del PDF de un registro y, si está listo, su archivo con su huella. */
export async function systemFormPdf(
  tx: TenantTransaction,
  recordId: string,
): Promise<SystemFormPdf | null> {
  const record = await tx.docFormRecord.findFirst({
    where: { id: recordId, deletedAt: null },
    select: { renderStatus: true, pdfFile: { select: { id: true, sha256: true } } },
  });
  if (record === null) return null;
  const file = record.pdfFile;
  if (record.renderStatus === 'ready' && file !== null && file.sha256 !== null) {
    return { status: 'ready', fileId: file.id, sha256: file.sha256 };
  }
  const status = record.renderStatus === 'failed' ? 'failed' : 'pending';
  return { status, fileId: null, sha256: null };
}
