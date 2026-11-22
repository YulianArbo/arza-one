import { Inject, Injectable } from '@nestjs/common';
import type {
  AuditDetailResponse,
  AuditFinding,
  AuditSummary,
  PlanAudit,
  QmsCodeResponse,
} from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { fromCalendarDate, nextBusinessCode } from '../../core/index.js';
import { assertAuditReader, assertIndependentAuditor } from './audit-rules.js';
import {
  auditRefs,
  auditSummaryView,
  auditView,
  FINDING_LINKS,
  findingCounts,
  findingViews,
} from './audit-views.js';
import type { QmsViewer } from './nonconformities.js';
import {
  assertPerson,
  assertProcess,
  auditQms,
  emitQms,
  qmsActorOf,
  qmsConflict,
  qmsNotFound,
  type QmsActor,
  type Target,
} from './qms-support.js';

// Planeación y consulta de las auditorías internas (B39; PL-SGC-002). Calidad asigna cada auditoría
// a un auditor independiente del proceso (decisiones 1 y 2), que recibe el aviso.

const AUDITS = { name: 'Auditorías internas', prefix: 'AUD', padding: 4 };

async function assertPlan(tx: TenantTransaction, input: PlanAudit): Promise<void> {
  const program = await tx.qmsAuditProgram.findFirst({
    where: { id: input.program_id, deletedAt: null },
  });
  if (program === null) throw qmsNotFound('El programa de auditorías no existe.');
  await assertProcess(tx, input.process_id);
  await assertPerson(tx, input.auditor_id);
  await assertIndependentAuditor(tx, input.auditor_id, input.process_id);
}

function planData(input: PlanAudit) {
  return {
    programId: input.program_id,
    processId: input.process_id,
    auditorId: input.auditor_id,
    plannedOn: fromCalendarDate(input.planned_on),
    objective: input.objective,
    criteria: input.criteria,
  };
}

async function notifyAuditor(
  tx: TenantTransaction,
  actor: QmsActor,
  audit: { id: string; code: string; auditorId: string; plannedOn: string },
): Promise<void> {
  await emitQms(tx, actor, 'qms.audit.assigned', {
    audit_id: audit.id,
    code: audit.code,
    planned_on: audit.plannedOn,
    recipients: [audit.auditorId],
  });
}

@Injectable()
export class Audits {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Las auditorías asignadas a la persona (Mi espacio). */
  async mine(principal: Principal): Promise<AuditSummary[]> {
    return this.database.withTenant(principal, async (tx) => {
      const audits = await tx.qmsAudit.findMany({
        where: { auditorId: principal.userId, deletedAt: null, status: { not: 'cancelled' } },
        orderBy: { plannedOn: 'asc' },
        take: 100,
      });
      const refs = await auditRefs(tx, audits);
      const counts = await findingCounts(
        tx,
        audits.map((audit) => audit.id),
      );
      return audits.map((audit) => auditSummaryView(audit, refs, counts.get(audit.id) ?? 0));
    });
  }

  async detail(viewer: QmsViewer, id: string): Promise<AuditDetailResponse> {
    return this.database.withTenant(viewer.principal, async (tx) => {
      const audit = await tx.qmsAudit.findFirst({ where: { id, deletedAt: null } });
      if (audit === null) throw qmsNotFound('La auditoría no existe.');
      assertAuditReader(viewer, audit);
      const rows = await tx.qmsFinding.findMany({
        where: { auditId: audit.id, deletedAt: null },
        include: FINDING_LINKS,
        orderBy: { createdAt: 'asc' },
      });
      const refs = await auditRefs(tx, [audit]);
      return { audit: auditView(audit, refs, rows.length), findings: await findingViews(tx, rows) };
    });
  }

  /** Todos los hallazgos, del más reciente al más antiguo. */
  async findings(principal: Principal): Promise<AuditFinding[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.qmsFinding.findMany({
        where: { deletedAt: null },
        include: FINDING_LINKS,
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      return findingViews(tx, rows);
    });
  }

  async plan(principal: Principal, meta: RequestMeta, input: PlanAudit): Promise<QmsCodeResponse> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    return this.database.withTenant(principal, async (tx) => {
      await assertPlan(tx, input);
      const code = await nextBusinessCode(tx, 'qms.audit', actor.at, AUDITS);
      const row = await tx.qmsAudit.create({
        data: { tenantId: actor.tenantId, code, ...planData(input) },
      });
      await auditQms(tx, actor, {
        action: 'qms.audit.plan',
        entityType: 'qms_audit',
        entityId: row.id,
        changes: { code, process_id: input.process_id, auditor_id: input.auditor_id },
      });
      await notifyAuditor(tx, actor, { ...row, plannedOn: input.planned_on });
      return { id: row.id, code };
    });
  }

  /** Mientras está programada, Calidad la reprograma o cambia de auditor. */
  async replan(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: PlanAudit,
  ): Promise<void> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const row = await tx.qmsAudit.findFirst({ where: { id: target.id, deletedAt: null } });
      if (row === null) throw qmsNotFound('La auditoría no existe.');
      if (row.status !== 'planned')
        throw qmsConflict('Solo se reprograma una auditoría programada.');
      await assertPlan(tx, input);
      const updated = await tx.qmsAudit.updateMany({
        where: { id: row.id, version: target.version, status: 'planned' },
        data: planData(input),
      });
      if (updated.count !== 1) throw versionConflict();
      await auditQms(tx, actor, {
        action: 'qms.audit.replan',
        entityType: 'qms_audit',
        entityId: row.id,
        changes: changesBetween(
          { auditor_id: row.auditorId, process_id: row.processId },
          { auditor_id: input.auditor_id, process_id: input.process_id },
        ),
      });
      if (row.auditorId !== input.auditor_id) {
        const next = { id: row.id, code: row.code, auditorId: input.auditor_id };
        await notifyAuditor(tx, actor, { ...next, plannedOn: input.planned_on });
      }
    });
  }
}
