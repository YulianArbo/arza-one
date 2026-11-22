import {
  CHECKLIST_RESULTS,
  checklistResultSchema,
  FINDING_TYPES,
  findingTypeSchema,
  REVIEW_INPUTS,
} from '@arza/contracts';
import {
  auditReportBody,
  institutionalFooter,
  institutionalHeader,
  managementReviewBody,
  printedDate,
  printPage,
} from '@arza/templates';

import type { QmsAudit, QmsManagementReview } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { companyIdentity, toCalendarDate } from '../../core/index.js';
import { auditRefs, auditView, FINDING_LINKS, findingViews } from './audit-views.js';
import { refOf } from './qms-support.js';
import { reviewView } from './review-views.js';

// El Informe de auditoría (RE-SGC-004) y el Acta de revisión por la dirección (RE-SGC-007), listos
// para que Gotenberg los convierta a PDF con el marco institucional (B39, decisión 9). Se arman una
// sola vez: al emitirse el informe y al aprobarse el acta.

/** Lo que Gotenberg necesita para convertir una página HTML (doc/gotenberg-converter). */
export interface QualityHtml {
  readonly index: string;
  readonly header: string;
  readonly footer: string;
  readonly landscape: boolean;
}

const REPORT_FORMAT = {
  code: 'RE-SGC-004',
  name: 'INFORME DE AUDITORÍA INTERNA',
  version: '01',
  date: '—',
};
const REVIEW_FORMAT = {
  code: 'RE-SGC-007',
  name: 'ACTA DE REVISIÓN POR LA DIRECCIÓN',
  version: '01',
  date: '—',
};

function shown(date: string | null): string {
  return date === null ? '—' : printedDate(date);
}

export async function auditReportHtml(tx: TenantTransaction, row: QmsAudit): Promise<QualityHtml> {
  const findings = await tx.qmsFinding.findMany({
    where: { auditId: row.id, deletedAt: null },
    include: FINDING_LINKS,
    orderBy: { createdAt: 'asc' },
  });
  const refs = await auditRefs(tx, [row]);
  const audit = auditView(row, refs, findings.length);
  const company = await companyIdentity(tx);
  const body = auditReportBody({
    code: audit.code,
    process: audit.process.name,
    auditor: refOf(refs.people, row.auditorId).name,
    plannedOn: shown(audit.planned_on),
    startedOn: shown(audit.started_on),
    reportedOn: shown(audit.reported_on),
    objective: audit.objective,
    criteria: audit.criteria ?? '—',
    checklist: audit.checklist.map((item) => ({
      requirement: item.requirement,
      question: item.question,
      result: CHECKLIST_RESULTS[checklistResultSchema.parse(item.result)],
      evidence: item.evidence ?? '—',
    })),
    findings: (await findingViews(tx, findings)).map((finding) => ({
      type: FINDING_TYPES[findingTypeSchema.parse(finding.type)],
      requirement: finding.requirement,
      description: finding.description,
      evidence: finding.evidence,
      followUp: finding.nonconformity?.code ?? finding.action?.code ?? '—',
    })),
    conclusions: audit.conclusions ?? '',
  });
  return {
    index: printPage(`Informe de auditoría ${audit.code}`, body),
    header: institutionalHeader(REPORT_FORMAT, company),
    footer: institutionalFooter(company, audit.code),
    landscape: false,
  };
}

export async function managementReviewHtml(
  tx: TenantTransaction,
  row: QmsManagementReview,
): Promise<QualityHtml> {
  const review = await reviewView(tx, row);
  const company = await companyIdentity(tx);
  const body = managementReviewBody({
    code: review.code,
    period: `${printedDate(review.period_from)} a ${printedDate(review.period_to)}`,
    meetingOn: printedDate(review.meeting_on),
    attendees: review.attendees,
    sections: review.inputs.map((input) => ({
      title: REVIEW_INPUTS[input.key].title,
      lines: input.lines,
      comment: input.comment ?? '',
    })),
    conclusions: review.conclusions ?? '',
    decisions: review.decisions.map((decision) => ({
      description: decision.description,
      responsible: decision.responsible.name,
      dueOn: printedDate(decision.due_on),
      action: decision.action?.code ?? '—',
    })),
    approvedBy: review.approved_by?.name ?? '—',
    approvedOn: shown(row.approvedOn === null ? null : toCalendarDate(row.approvedOn)),
  });
  return {
    index: printPage(`Acta de revisión por la dirección ${review.code}`, body),
    header: institutionalHeader(REVIEW_FORMAT, company),
    footer: institutionalFooter(company, review.code),
    landscape: false,
  };
}
