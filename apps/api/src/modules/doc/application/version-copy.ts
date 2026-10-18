import { controlledCopyStamp, printedDate } from '@arza/templates';

import { bogotaToday, toCalendarDate } from '../../core/index.js';
import { ConversionRejectedError } from '../infrastructure/gotenberg-converter.js';
import { auditDoc } from './doc-support.js';
import {
  storePdf,
  systemActor,
  type Outcome,
  type PdfRenderDependencies,
} from './generated-pdf.js';

// Copia de consulta de cada versión vigente (B20, ficha 17.4): su PDF con el pie de código,
// versión, fecha de vigencia y la leyenda «Copia no controlada cuando se imprime». Es lo que
// descargan las personas; el PDF original se conserva sin cambios.

interface CopySource {
  readonly code: string;
  readonly label: string;
  readonly fileName: string;
  readonly content: Buffer;
  readonly text: string;
}

/** La versión vigente que aún no tiene copia, con el texto de su pie; null si ya no aplica. */
async function copySource(
  deps: PdfRenderDependencies,
  tenantId: string,
  versionId: string,
): Promise<CopySource | null> {
  const found = await deps.database.withTenant({ tenantId, userId: null }, (tx) =>
    tx.docVersion.findFirst({
      where: { id: versionId, status: 'current', copyFileId: null, deletedAt: null },
      include: { document: true, pdfFile: true },
    }),
  );
  if (found === null) return null;
  const { pdfFile } = found;
  if (pdfFile === null) return null;
  const effective =
    found.effectiveDate === null
      ? bogotaToday(found.publishedAt ?? deps.clock.now())
      : toCalendarDate(found.effectiveDate);
  const date = printedDate(effective);
  return {
    code: found.document.code,
    label: found.versionLabel,
    fileName: pdfFile.fileName,
    content: await deps.storage.read(pdfFile.storageKey),
    text: controlledCopyStamp({ code: found.document.code, version: found.versionLabel, date }),
  };
}

/** El PDF sellado. Un PDF protegido no admite el sello: la copia es el mismo PDF. */
async function stamped(
  deps: PdfRenderDependencies,
  source: CopySource,
): Promise<{ readonly content: Buffer; readonly stamped: boolean }> {
  try {
    return { content: await deps.stamp(source.content, source.text), stamped: true };
  } catch (error) {
    if (!(error instanceof ConversionRejectedError)) throw error;
    return { content: source.content, stamped: false };
  }
}

/** La copia de consulta: el PDF vigente con el pie de copia no controlada. */
export async function stampVersion(
  deps: PdfRenderDependencies,
  tenantId: string,
  versionId: string,
): Promise<Outcome> {
  const source = await copySource(deps, tenantId, versionId);
  if (source === null) return 'skipped';
  const copy = await stamped(deps, source);
  const target = { tenantId, fileName: source.fileName, content: copy.content };
  const stored = await storePdf(deps, target, async (tx, fileId, at) => {
    const { count } = await tx.docVersion.updateMany({
      where: { id: versionId, status: 'current', copyFileId: null },
      data: { copyFileId: fileId },
    });
    if (count === 0) return false;
    await auditDoc(tx, systemActor(tenantId, at), {
      action: 'doc.version.copy',
      entityType: 'doc_version',
      entityId: versionId,
      changes: {
        code: source.code,
        label: source.label,
        copy_file_id: fileId,
        stamped: copy.stamped,
      },
    });
    return true;
  });
  return stored ? 'ready' : 'skipped';
}
