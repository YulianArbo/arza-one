import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { storeGeneratedPdf, type FileStorage } from '../../doc/index.js';
import { auditReportHtml, managementReviewHtml, type QualityHtml } from './quality-documents.js';

// PDF de Calidad en el worker (B39, decisión 9): el informe de cada auditoría emitida y el acta de
// cada revisión aprobada. Cada pocos segundos toma lo pendiente; repetirlo no cambia nada, y si
// Gotenberg o el almacenamiento no responden, queda para la siguiente pasada.

export interface QualityPdfDependencies {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
  readonly storage: Pick<FileStorage, 'read' | 'put' | 'delete'>;
  readonly convertHtml: (document: QualityHtml) => Promise<Buffer>;
}

export interface QualityPdfResult {
  readonly reports: number;
  readonly reviews: number;
}

const BATCH = 10;

interface PdfTarget {
  readonly tenantId: string;
  readonly entityType: 'qms_audit' | 'qms_management_review';
  readonly id: string;
  readonly code: string;
  readonly html: QualityHtml;
}

async function auditPdf(tx: TenantTransaction, at: Date, target: PdfTarget, fileId: string) {
  await recordAuditEvent(tx, {
    tenantId: target.tenantId,
    occurredAt: at,
    actor: { kind: 'system' },
    action: target.entityType === 'qms_audit' ? 'qms.audit.render' : 'qms.management_review.render',
    entityType: target.entityType,
    entityId: target.id,
    result: 'success',
    changes: { code: target.code, file_id: fileId },
    meta: null,
  });
}

async function store(
  deps: QualityPdfDependencies,
  tenantId: string,
  target: PdfTarget,
  attach: (tx: TenantTransaction, fileId: string) => Promise<number>,
): Promise<boolean> {
  const content = await deps.convertHtml(target.html);
  return storeGeneratedPdf(
    deps,
    { tenantId, fileName: `${target.code}.pdf`, content },
    async (tx, fileId, at) => {
      if ((await attach(tx, fileId)) === 0) return false;
      await auditPdf(tx, at, target, fileId);
      return true;
    },
  );
}

async function renderReport(deps: QualityPdfDependencies, tenantId: string, id: string) {
  const scope = { tenantId, userId: null };
  const target = await deps.database.withTenant(scope, async (tx) => {
    const audit = await tx.qmsAudit.findFirst({ where: { id, pdfStatus: 'pending' } });
    if (audit === null) return null;
    const html = await auditReportHtml(tx, audit);
    return { tenantId, entityType: 'qms_audit' as const, id, code: audit.code, html };
  });
  if (target === null) return false;
  return store(deps, tenantId, target, async (tx, fileId) => {
    const { count } = await tx.qmsAudit.updateMany({
      where: { id, pdfStatus: 'pending' },
      data: { pdfStatus: 'ready', reportFileId: fileId },
    });
    return count;
  });
}

async function renderReview(deps: QualityPdfDependencies, tenantId: string, id: string) {
  const scope = { tenantId, userId: null };
  const target = await deps.database.withTenant(scope, async (tx) => {
    const review = await tx.qmsManagementReview.findFirst({ where: { id, pdfStatus: 'pending' } });
    if (review === null) return null;
    const html = await managementReviewHtml(tx, review);
    const entityType = 'qms_management_review' as const;
    return { tenantId, entityType, id, code: review.code, html };
  });
  if (target === null) return false;
  return store(deps, tenantId, target, async (tx, fileId) => {
    const { count } = await tx.qmsManagementReview.updateMany({
      where: { id, pdfStatus: 'pending' },
      data: { pdfStatus: 'ready', fileId },
    });
    return count;
  });
}

async function pendingOf(deps: QualityPdfDependencies, tenantId: string) {
  return deps.database.withTenant({ tenantId, userId: null }, async (tx) => ({
    reports: await tx.qmsAudit.findMany({
      where: { pdfStatus: 'pending', deletedAt: null },
      select: { id: true },
      take: BATCH,
    }),
    reviews: await tx.qmsManagementReview.findMany({
      where: { pdfStatus: 'pending', deletedAt: null },
      select: { id: true },
      take: BATCH,
    }),
  }));
}

/** Genera los PDF pendientes de todas las empresas. */
export async function renderQualityPdfs(deps: QualityPdfDependencies): Promise<QualityPdfResult> {
  const tenants = await deps.database.withoutTenant(
    (tx) => tx.$queryRaw<{ id: string }[]>`SELECT qms_tenants_with_pdf_work()::text AS id`,
  );
  let reports = 0;
  let reviews = 0;
  for (const { id: tenantId } of tenants) {
    const pending = await pendingOf(deps, tenantId);
    for (const { id } of pending.reports) if (await renderReport(deps, tenantId, id)) reports += 1;
    for (const { id } of pending.reviews) if (await renderReview(deps, tenantId, id)) reviews += 1;
  }
  return { reports, reviews };
}
