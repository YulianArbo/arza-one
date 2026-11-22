import {
  auditChecklistItemSchema,
  type Audit,
  type AuditFinding,
  type AuditSummary,
  type QmsRef,
} from '@arza/contracts';
import { z } from 'zod';

import type {
  QmsAudit as QmsAuditRow,
  QmsFinding as QmsFindingRow,
} from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { toCalendarDate } from '../../core/index.js';
import { dateOf, processRefs, refOf, userRefs } from './qms-support.js';

// Cómo se muestran el programa, las auditorías y sus hallazgos (B39).

const storedChecklistSchema = z.array(auditChecklistItemSchema);

export interface AuditRefs {
  readonly people: ReadonlyMap<string, QmsRef>;
  readonly processes: ReadonlyMap<string, QmsRef>;
}

export async function auditRefs(
  tx: TenantTransaction,
  audits: readonly Pick<QmsAuditRow, 'auditorId' | 'processId'>[],
): Promise<AuditRefs> {
  return {
    people: await userRefs(
      tx,
      audits.map((audit) => audit.auditorId),
    ),
    processes: await processRefs(
      tx,
      audits.map((audit) => audit.processId),
    ),
  };
}

export function auditSummaryView(
  row: QmsAuditRow,
  refs: AuditRefs,
  findings: number,
): AuditSummary {
  return {
    id: row.id,
    code: row.code,
    program_id: row.programId,
    process: refOf(refs.processes, row.processId, 'Proceso'),
    auditor: refOf(refs.people, row.auditorId),
    planned_on: toCalendarDate(row.plannedOn),
    status: row.status as AuditSummary['status'],
    findings,
    version: row.version,
  };
}

export function auditView(row: QmsAuditRow, refs: AuditRefs, findings: number): Audit {
  const checklist = storedChecklistSchema.parse(row.checklist);
  return {
    ...auditSummaryView(row, refs, findings),
    objective: row.objective,
    criteria: row.criteria,
    started_on: dateOf(row.startedOn),
    reported_on: dateOf(row.reportedOn),
    conclusions: row.conclusions,
    cancel_reason: row.cancelReason,
    checklist,
    report_document_id: row.reportFileId,
  };
}

type FindingWithLinks = QmsFindingRow & {
  readonly audit: Pick<QmsAuditRow, 'id' | 'code' | 'processId'>;
  readonly nonconformity: { readonly id: string; readonly code: string } | null;
  readonly actions: readonly { readonly id: string; readonly code: string }[];
};

/** Lo que se carga con cada hallazgo para mostrarlo. */
export const FINDING_LINKS = {
  audit: { select: { id: true, code: true, processId: true } },
  nonconformity: { select: { id: true, code: true } },
  actions: { select: { id: true, code: true }, where: { deletedAt: null } },
} as const;

function findingView(row: FindingWithLinks, processes: ReadonlyMap<string, QmsRef>): AuditFinding {
  return {
    id: row.id,
    audit: { id: row.audit.id, code: row.audit.code },
    process: refOf(processes, row.audit.processId, 'Proceso'),
    type: row.findingType as AuditFinding['type'],
    requirement: row.requirement,
    description: row.description,
    evidence: row.evidence,
    nonconformity: row.nonconformity,
    action: row.actions[0] ?? null,
  };
}

export async function findingViews(
  tx: TenantTransaction,
  rows: readonly FindingWithLinks[],
): Promise<AuditFinding[]> {
  const processes = await processRefs(
    tx,
    rows.map((row) => row.audit.processId),
  );
  return rows.map((row) => findingView(row, processes));
}

/** Cuántos hallazgos tiene cada auditoría. */
export async function findingCounts(
  tx: TenantTransaction,
  auditIds: readonly string[],
): Promise<Map<string, number>> {
  const groups = await tx.qmsFinding.groupBy({
    by: ['auditId'],
    where: { auditId: { in: [...auditIds] }, deletedAt: null },
    _count: { _all: true },
  });
  return new Map(groups.map((group) => [group.auditId, group._count._all]));
}
