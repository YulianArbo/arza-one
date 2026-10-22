import { MAX_FILE_BYTES } from '@arza/contracts';
import { TemplateSyntaxError } from '@arza/templates';

import { ConversionRejectedError } from '../infrastructure/gotenberg-converter.js';
import { auditDoc } from './doc-support.js';
import {
  storePdf,
  systemActor,
  type Outcome,
  type PdfRenderDependencies,
} from './generated-pdf.js';
import { recordDocument } from './record-document.js';
import { stampVersion } from './version-copy.js';

// PDF generados en segundo plano (B20, numeral 13.2): el de cada registro diligenciado que terminó,
// con el encabezado y el pie institucionales, y la copia de consulta de cada versión vigente
// (version-copy.ts). El worker lo revisa cada pocos segundos en todas las empresas;
// repetirlo no cambia nada, porque solo toma lo que sigue pendiente.

export type { PdfRenderDependencies } from './generated-pdf.js';

export interface PdfRenderResult {
  readonly records: number;
  readonly copies: number;
  readonly failed: number;
}

/** Cuántos registros y versiones toma por empresa en cada pasada; los demás, en la siguiente. */
const BATCH = 25;

async function markFailed(
  deps: PdfRenderDependencies,
  tenantId: string,
  recordId: string,
): Promise<Outcome> {
  const at = deps.clock.now();
  return deps.database.withTenant({ tenantId, userId: null }, async (tx) => {
    const { count } = await tx.docFormRecord.updateMany({
      where: { id: recordId, renderStatus: 'pending' },
      data: { renderStatus: 'failed' },
    });
    if (count === 0) return 'skipped';
    await auditDoc(tx, systemActor(tenantId, at), {
      action: 'doc.form_record.render',
      entityType: 'doc_form_record',
      entityId: recordId,
      changes: { status: 'failed', pdf_file_id: null },
    });
    return 'failed';
  });
}

/** El PDF del registro; null si ya no lo espera. Una plantilla dañada o rechazada falla. */
async function convertRecord(
  deps: PdfRenderDependencies,
  tenantId: string,
  recordId: string,
): Promise<{ readonly code: string; readonly content: Buffer } | null | 'failed'> {
  const scope = { tenantId, userId: null };
  try {
    const document = await deps.database.withTenant(scope, (tx) =>
      recordDocument(tx, deps.storage, recordId),
    );
    if (document === null) return null;
    const content =
      document.kind === 'html'
        ? await deps.convertHtml(document.html)
        : await deps.convertOffice(document.word);
    return { code: document.code, content };
  } catch (error) {
    if (error instanceof ConversionRejectedError || error instanceof TemplateSyntaxError) {
      return 'failed';
    }
    throw error;
  }
}

async function renderRecord(
  deps: PdfRenderDependencies,
  tenantId: string,
  recordId: string,
): Promise<Outcome> {
  const converted = await convertRecord(deps, tenantId, recordId);
  if (converted === null) return 'skipped';
  if (converted === 'failed') return markFailed(deps, tenantId, recordId);
  const { code, content } = converted;
  if (content.length === 0 || content.length > MAX_FILE_BYTES)
    return markFailed(deps, tenantId, recordId);
  const stored = await storePdf(
    deps,
    { tenantId, fileName: `${code}.pdf`, content },
    async (tx, fileId, at) => {
      const { count } = await tx.docFormRecord.updateMany({
        where: { id: recordId, renderStatus: 'pending' },
        data: { pdfFileId: fileId, renderStatus: 'ready' },
      });
      if (count === 0) return false;
      await auditDoc(tx, systemActor(tenantId, at), {
        action: 'doc.form_record.render',
        entityType: 'doc_form_record',
        entityId: recordId,
        changes: { status: 'ready', pdf_file_id: fileId },
      });
      return true;
    },
  );
  return stored ? 'ready' : 'skipped';
}

async function pendingOf(deps: PdfRenderDependencies, tenantId: string) {
  return deps.database.withTenant({ tenantId, userId: null }, async (tx) => ({
    records: await tx.docFormRecord.findMany({
      where: { renderStatus: 'pending', deletedAt: null },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: BATCH,
    }),
    versions: await tx.docVersion.findMany({
      // Solo con su PDF disponible: el de un documento eliminado por disposición final (B21) ya
      // no existe y no tiene copia que generar.
      where: {
        status: 'current',
        copyFileId: null,
        pdfFile: { is: { scanStatus: 'available' } },
        deletedAt: null,
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: BATCH,
    }),
  }));
}

const NOTHING: PdfRenderResult = { records: 0, copies: 0, failed: 0 };

function added(a: PdfRenderResult, b: PdfRenderResult): PdfRenderResult {
  return {
    records: a.records + b.records,
    copies: a.copies + b.copies,
    failed: a.failed + b.failed,
  };
}

/** Genera los PDF pendientes de una empresa. */
export async function renderTenantPdfs(
  deps: PdfRenderDependencies,
  tenantId: string,
): Promise<PdfRenderResult> {
  const pending = await pendingOf(deps, tenantId);
  const outcomes: Outcome[] = [];
  const copies: Outcome[] = [];
  for (const { id } of pending.records) outcomes.push(await renderRecord(deps, tenantId, id));
  for (const { id } of pending.versions) copies.push(await stampVersion(deps, tenantId, id));
  return {
    records: outcomes.filter((o) => o === 'ready').length,
    copies: copies.filter((o) => o === 'ready').length,
    failed: outcomes.filter((o) => o === 'failed').length,
  };
}

/** Genera los PDF pendientes de todas las empresas. */
export async function renderPendingPdfs(deps: PdfRenderDependencies): Promise<PdfRenderResult> {
  const tenants = await deps.database.withoutTenant(
    (tx) => tx.$queryRaw<{ id: string }[]>`SELECT doc_tenants_with_pending_pdfs() AS id`,
  );
  let result = NOTHING;
  for (const { id } of tenants) result = added(result, await renderTenantPdfs(deps, id));
  return result;
}
