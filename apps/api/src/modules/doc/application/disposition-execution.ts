import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { auditDoc, lockDocument } from './doc-support.js';
import { certificateDocument } from './disposition-certificate.js';
import { storePdf, systemActor, type PdfRenderDependencies } from './generated-pdf.js';

// Ejecución de las propuestas de disposición aprobadas (B21, numerales 12.1 y 12.4), en el worker:
// 1. marca cada documento que se elimina como eliminado, con sus archivos y su texto de búsqueda
//    (la base de datos lo permite solo con la regla vencida y la propuesta aprobada);
// 2. borra esos archivos del almacenamiento;
// 3. genera el acta en PDF y deja la propuesta ejecutada.
// Repetirlo no cambia nada: cada paso toma solo lo que falta.

export type DispositionExecutionDependencies = Pick<
  PdfRenderDependencies,
  'database' | 'clock' | 'storage' | 'convertHtml'
>;

/** Los archivos de todas las versiones de los documentos: fuente, PDF y copia de consulta. */
async function versionFileIds(
  tx: TenantTransaction,
  documentIds: readonly string[],
): Promise<string[]> {
  const versions = await tx.docVersion.findMany({
    where: { documentId: { in: [...documentIds] } },
    select: { sourceFileId: true, pdfFileId: true, copyFileId: true },
  });
  return versions.flatMap((v) =>
    [v.sourceFileId, v.pdfFileId, v.copyFileId].filter((id) => id !== null),
  );
}

async function disposeDocument(
  tx: TenantTransaction,
  item: { readonly id: string; readonly documentId: string },
  context: { readonly tenantId: string; readonly at: Date; readonly approver: string | null },
): Promise<void> {
  await lockDocument(tx, context.tenantId, item.documentId);
  const document = await tx.docDocument.findFirstOrThrow({ where: { id: item.documentId } });
  if (document.status !== 'disposed') {
    await tx.docDocument.update({
      where: { id: document.id },
      data: { status: 'disposed', disposedAt: context.at },
    });
  }
  const files = await versionFileIds(tx, [document.id]);
  await tx.file.updateMany({
    where: { id: { in: files }, scanStatus: 'available' },
    data: { scanStatus: 'disposed' },
  });
  await tx.docVersionText.updateMany({
    where: { documentId: document.id, status: { not: 'disposed' } },
    data: { status: 'disposed', content: '' },
  });
  await tx.docDisposition.update({
    where: { id: item.id },
    data: { executedAt: context.at, executedBy: context.approver },
  });
  await auditDoc(tx, systemActor(context.tenantId, context.at), {
    action: 'doc.document.dispose',
    entityType: 'doc_document',
    entityId: document.id,
    changes: { code: document.code, title: document.title, files: files.length },
  });
}

/** Paso 1: los documentos que faltan, en una transacción. Devuelve si la propuesta sigue aprobada. */
async function disposeDocuments(
  deps: DispositionExecutionDependencies,
  tenantId: string,
  proposalId: string,
): Promise<boolean> {
  const at = deps.clock.now();
  return deps.database.withTenant({ tenantId, userId: null }, async (tx) => {
    const proposal = await tx.docDispositionProposal.findFirst({
      where: { id: proposalId, status: 'approved', deletedAt: null },
    });
    if (proposal === null) return false;
    const pending = await tx.docDisposition.findMany({
      where: { proposalId, action: 'destroy', executedAt: null, deletedAt: null },
      select: { id: true, documentId: true },
    });
    const context = { tenantId, at, approver: proposal.decidedBy };
    for (const item of pending) await disposeDocument(tx, item, context);
    return true;
  });
}

/** Paso 2: borra del almacenamiento los archivos eliminados de la propuesta. */
async function purgeStorage(
  deps: DispositionExecutionDependencies,
  tenantId: string,
  proposalId: string,
): Promise<void> {
  const keys = await deps.database.withTenant({ tenantId, userId: null }, async (tx) => {
    const items = await tx.docDisposition.findMany({
      where: { proposalId, action: 'destroy', deletedAt: null },
      select: { documentId: true },
    });
    const ids = await versionFileIds(
      tx,
      items.map((item) => item.documentId),
    );
    const files = await tx.file.findMany({
      where: { id: { in: ids }, scanStatus: 'disposed' },
      select: { storageKey: true },
    });
    return files.map((file) => file.storageKey);
  });
  for (const key of keys) await deps.storage.delete(key);
}

/** Paso 3: el acta en PDF; la propuesta queda ejecutada. */
async function issueCertificate(
  deps: DispositionExecutionDependencies,
  tenantId: string,
  proposalId: string,
): Promise<boolean> {
  const at = deps.clock.now();
  const prepared = await deps.database.withTenant({ tenantId, userId: null }, async (tx) => {
    const proposal = await tx.docDispositionProposal.findFirstOrThrow({
      where: { id: proposalId },
    });
    return { code: proposal.code, document: await certificateDocument(tx, proposal, at) };
  });
  const content = await deps.convertHtml(prepared.document);
  return storePdf(
    deps,
    { tenantId, fileName: `${prepared.code}.pdf`, content },
    async (tx, fileId, storedAt) => {
      const { count } = await tx.docDispositionProposal.updateMany({
        where: { id: proposalId, status: 'approved' },
        data: { status: 'executed', executedAt: storedAt, certificateFileId: fileId },
      });
      if (count === 0) return false;
      await auditDoc(tx, systemActor(tenantId, storedAt), {
        action: 'doc.disposition.execute',
        entityType: 'doc_disposition_proposal',
        entityId: proposalId,
        changes: { code: prepared.code, certificate_file_id: fileId },
      });
      return true;
    },
  );
}

/** Ejecuta una propuesta aprobada; false si ya no estaba aprobada (otra pasada la terminó). */
export async function executeProposal(
  deps: DispositionExecutionDependencies,
  tenantId: string,
  proposalId: string,
): Promise<boolean> {
  if (!(await disposeDocuments(deps, tenantId, proposalId))) return false;
  await purgeStorage(deps, tenantId, proposalId);
  return issueCertificate(deps, tenantId, proposalId);
}

/** Trabajo del worker: las propuestas aprobadas de todas las empresas. Devuelve cuántas terminó. */
export async function executeApprovedDispositions(
  deps: DispositionExecutionDependencies,
): Promise<number> {
  const tenants = await deps.database.withoutTenant(
    (tx) => tx.$queryRaw<{ id: string }[]>`SELECT doc_tenants_with_approved_dispositions() AS id`,
  );
  let executed = 0;
  for (const { id: tenantId } of tenants) {
    const approved = await deps.database.withTenant({ tenantId, userId: null }, (tx) =>
      tx.docDispositionProposal.findMany({
        where: { status: 'approved', deletedAt: null },
        select: { id: true },
        orderBy: { id: 'asc' },
      }),
    );
    for (const { id } of approved) {
      if (await executeProposal(deps, tenantId, id)) executed += 1;
    }
  }
  return executed;
}
