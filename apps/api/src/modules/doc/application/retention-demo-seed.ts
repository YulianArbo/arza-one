import { createHash } from 'node:crypto';

import { v7 as uuidv7 } from 'uuid';

import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { auditDoc } from './doc-support.js';

// Datos ficticios de la retención (B21), solo para las empresas de demostración: una regla de
// contratos ficticios y dos contratos publicados en 2015, cuya retención ya venció, para ver en
// pantalla la propuesta de disposición. Sus archivos no existen en el almacenamiento (la semilla
// solo usa la base de datos): el visor no los muestra, y al eliminarlos no hay nada que borrar.

const RULE_CODE = 'DEMO-CT';
const PUBLISHED = new Date('2015-03-02T15:00:00Z');
const DOCUMENTS = [
  { code: 'DOC-2015-0001', title: 'Contrato ficticio de soporte 2015' },
  { code: 'DOC-2015-0002', title: 'Contrato ficticio de licencias 2015' },
] as const;

async function demoFile(tx: TenantTransaction, tenantId: string, code: string): Promise<string> {
  const content = `Archivo ficticio ${code}`;
  const file = await tx.file.create({
    data: {
      tenantId,
      storageKey: `${tenantId}/${uuidv7()}`,
      fileName: `${code}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: content.length,
      sha256: createHash('sha256').update(content).digest('hex'),
      scanStatus: 'available',
      scannedAt: PUBLISHED,
    },
  });
  return file.id;
}

async function demoVersion(
  tx: TenantTransaction,
  input: { tenantId: string; documentId: string; fileId: string; title: string },
): Promise<string> {
  const version = await tx.docVersion.create({
    data: {
      tenantId: input.tenantId,
      documentId: input.documentId,
      number: 0,
      versionLabel: '00',
      status: 'current',
      origin: 'import',
      sourceFileId: input.fileId,
      pdfFileId: input.fileId,
      // Sin archivo en el almacenamiento no hay copia de consulta que generar.
      copyFileId: input.fileId,
      renderStatus: 'ready',
      title: input.title,
      classification: 'internal',
      changeSummary: 'Dato ficticio de demostración',
      submittedAt: PUBLISHED,
      approvedAt: PUBLISHED,
      effectiveDate: PUBLISHED,
      publishedAt: PUBLISHED,
    },
  });
  return version.id;
}

async function demoDocument(
  tx: TenantTransaction,
  input: { tenantId: string; folderId: string; code: string; title: string },
): Promise<void> {
  const fileId = await demoFile(tx, input.tenantId, input.code);
  const document = await tx.docDocument.create({
    data: {
      tenantId: input.tenantId,
      folderId: input.folderId,
      code: input.code,
      title: input.title,
      docType: 'CT',
      classification: 'internal',
      isControlled: false,
    },
  });
  const versionId = await demoVersion(tx, {
    tenantId: input.tenantId,
    documentId: document.id,
    fileId,
    title: input.title,
  });
  await tx.docDocument.update({
    where: { id: document.id },
    data: { status: 'current', currentVersionId: versionId },
  });
}

export async function seedRetentionDemo(
  database: Pick<DatabaseService, 'withTenant'>,
  tenantIds: readonly string[],
  clock: Clock,
): Promise<void> {
  for (const tenantId of tenantIds) {
    await database.withTenant({ tenantId, userId: null }, async (tx) => {
      if ((await tx.docRetentionRule.count({ where: { code: RULE_CODE } })) > 0) return;
      const folder = await tx.docFolder.findFirstOrThrow({ where: { code: 'EXP' } });
      const rule = await tx.docRetentionRule.create({
        data: {
          tenantId,
          code: RULE_CODE,
          name: 'Contratos ficticios de demostración',
          docType: 'CT',
          activeYears: 2,
          archiveYears: 3,
          disposition: 'destroy',
          legalBasis: 'Dato ficticio de demostración',
        },
      });
      for (const document of DOCUMENTS) {
        await demoDocument(tx, { tenantId, folderId: folder.id, ...document });
      }
      const at = clock.now();
      await auditDoc(
        tx,
        { tenantId, userId: null, meta: null, at },
        {
          action: 'doc.retention_rule.seed',
          entityType: 'doc_retention_rule',
          entityId: rule.id,
          changes: { code: RULE_CODE, documents: DOCUMENTS.length },
        },
      );
    });
  }
}
