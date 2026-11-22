import { Inject, Injectable } from '@nestjs/common';
import {
  auditStatusSchema,
  canAuditStep,
  findingOpensNonconformity,
  findingTypeSchema,
  type AddFinding,
  type AuditStep,
  type CancelAudit,
  type FindingAction,
  type QmsCodeResponse,
  type ReportAudit,
  type SaveChecklist,
  type StartAudit,
} from '@arza/contracts';

import type { Prisma, QmsAudit } from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission } from '../../../platform/access/ability.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { assertPlan, insertAction, NO_LINK } from './action-records.js';
import { assertAuditWorker, assertIndependentAuditor } from './audit-rules.js';
import type { QmsViewer } from './nonconformities.js';
import { openNonconformityFromFinding } from './nonconformity-origins.js';
import {
  auditQms,
  emitQms,
  qmsActorOf,
  qmsConflict,
  qmsInvalid,
  qmsNotFound,
  qualityLeaders,
  type QmsActor,
  type Target,
} from './qms-support.js';

// Los pasos de una auditoría (B39): el auditor la inicia, diligencia la lista de chequeo
// (RE-SGC-003), registra los hallazgos y emite el informe (RE-SGC-004); al emitirlo, cada hallazgo
// de no conformidad abre su no conformidad (decisión 3) y el PDF queda en cola (decisión 9). Calidad
// la cierra o la cancela y convierte observaciones y oportunidades en acciones de mejora.

interface StepContext {
  readonly tx: TenantTransaction;
  readonly actor: QmsActor;
  readonly audit: QmsAudit;
}

const STEP_LABELS: Readonly<Record<AuditStep, string>> = {
  start: 'iniciar',
  checklist: 'diligenciar la lista de chequeo de',
  finding: 'registrar hallazgos en',
  report: 'emitir el informe de',
  close: 'cerrar',
  cancel: 'cancelar',
};

function assertStep(audit: QmsAudit, step: AuditStep): void {
  if (canAuditStep(step, auditStatusSchema.parse(audit.status))) return;
  throw qmsConflict(`No se puede ${STEP_LABELS[step]} la auditoría en su estado actual.`);
}

function assertNotFuture(date: string, at: Date, label: string): void {
  if (date > bogotaToday(at)) throw qmsInvalid(`La fecha de ${label} no puede ser futura.`);
}

async function move(
  ctx: StepContext,
  target: Target,
  step: AuditStep,
  data: Prisma.QmsAuditUpdateManyMutationInput,
): Promise<void> {
  const updated = await ctx.tx.qmsAudit.updateMany({
    where: { id: ctx.audit.id, version: target.version, status: ctx.audit.status },
    data,
  });
  if (updated.count !== 1) throw versionConflict();
  await auditQms(ctx.tx, ctx.actor, {
    action: `qms.audit.${step}`,
    entityType: 'qms_audit',
    entityId: ctx.audit.id,
    changes: { code: ctx.audit.code, status: [ctx.audit.status, data.status ?? ctx.audit.status] },
  });
}

/** Abre la no conformidad de cada hallazgo mayor o menor y la deja enlazada. */
async function openFindingNonconformities(ctx: StepContext, reportedOn: string): Promise<number> {
  const findings = await ctx.tx.qmsFinding.findMany({
    where: { auditId: ctx.audit.id, nonconformityId: null, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  const opening = findings.filter((row) =>
    findingOpensNonconformity(findingTypeSchema.parse(row.findingType)),
  );
  for (const finding of opening) {
    const nc = await openNonconformityFromFinding(ctx.tx, ctx.actor, {
      ...finding,
      auditCode: ctx.audit.code,
      processId: ctx.audit.processId,
      detectedOn: reportedOn,
    });
    await ctx.tx.qmsFinding.update({ where: { id: finding.id }, data: { nonconformityId: nc.id } });
  }
  return opening.length;
}

@Injectable()
export class AuditSteps {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private async step<T>(
    viewer: QmsViewer,
    meta: RequestMeta,
    auditId: string,
    run: (ctx: StepContext) => Promise<T>,
  ): Promise<T> {
    const actor = qmsActorOf(viewer.principal, this.clock.now(), meta);
    return this.database.withTenant(viewer.principal, async (tx) => {
      const audit = await tx.qmsAudit.findFirst({ where: { id: auditId, deletedAt: null } });
      if (audit === null) throw qmsNotFound('La auditoría no existe.');
      return run({ tx, actor, audit });
    });
  }

  /** El auditor la inicia; se comprueba otra vez que siga siendo independiente del proceso. */
  async start(
    viewer: QmsViewer,
    meta: RequestMeta,
    target: Target,
    input: StartAudit,
  ): Promise<void> {
    await this.step(viewer, meta, target.id, async (ctx) => {
      assertAuditWorker(viewer, ctx.audit);
      assertStep(ctx.audit, 'start');
      assertNotFuture(input.started_on, ctx.actor.at, 'inicio');
      await assertIndependentAuditor(ctx.tx, ctx.audit.auditorId, ctx.audit.processId);
      await move(ctx, target, 'start', {
        status: 'in_progress',
        startedOn: fromCalendarDate(input.started_on),
      });
    });
  }

  async saveChecklist(
    viewer: QmsViewer,
    meta: RequestMeta,
    target: Target,
    input: SaveChecklist,
  ): Promise<void> {
    await this.step(viewer, meta, target.id, async (ctx) => {
      assertAuditWorker(viewer, ctx.audit);
      assertStep(ctx.audit, 'checklist');
      await move(ctx, target, 'checklist', { checklist: input.items });
    });
  }

  async addFinding(
    viewer: QmsViewer,
    meta: RequestMeta,
    auditId: string,
    input: AddFinding,
  ): Promise<string> {
    return this.step(viewer, meta, auditId, async (ctx) => {
      assertAuditWorker(viewer, ctx.audit);
      assertStep(ctx.audit, 'finding');
      const row = await ctx.tx.qmsFinding.create({
        data: {
          tenantId: ctx.actor.tenantId,
          auditId: ctx.audit.id,
          findingType: input.type,
          requirement: input.requirement,
          description: input.description,
          evidence: input.evidence,
        },
      });
      await auditQms(ctx.tx, ctx.actor, {
        action: 'qms.audit.finding',
        entityType: 'qms_finding',
        entityId: row.id,
        changes: { audit_code: ctx.audit.code, type: input.type },
      });
      return row.id;
    });
  }

  /** Emite el informe: abre las no conformidades y deja el PDF en cola (decisiones 3 y 9). */
  async report(
    viewer: QmsViewer,
    meta: RequestMeta,
    target: Target,
    input: ReportAudit,
  ): Promise<void> {
    await this.step(viewer, meta, target.id, async (ctx) => {
      assertAuditWorker(viewer, ctx.audit);
      assertStep(ctx.audit, 'report');
      assertNotFuture(input.reported_on, ctx.actor.at, 'emisión');
      if (input.reported_on < toCalendarDate(ctx.audit.startedOn ?? ctx.audit.plannedOn)) {
        throw qmsInvalid('El informe no puede ser anterior al inicio de la auditoría.');
      }
      const opened = await openFindingNonconformities(ctx, input.reported_on);
      await move(ctx, target, 'report', {
        status: 'reported',
        reportedOn: fromCalendarDate(input.reported_on),
        conclusions: input.conclusions,
        pdfStatus: 'pending',
      });
      await emitQms(ctx.tx, ctx.actor, 'qms.audit.reported', {
        audit_id: ctx.audit.id,
        code: ctx.audit.code,
        nonconformities: opened,
        recipients: await qualityLeaders(ctx.tx, ctx.actor.at),
      });
    });
  }

  async close(viewer: QmsViewer, meta: RequestMeta, target: Target): Promise<void> {
    await this.step(viewer, meta, target.id, async (ctx) => {
      assertStep(ctx.audit, 'close');
      await move(ctx, target, 'close', {
        status: 'closed',
        closedOn: fromCalendarDate(bogotaToday(ctx.actor.at)),
      });
    });
  }

  async cancel(
    viewer: QmsViewer,
    meta: RequestMeta,
    target: Target,
    input: CancelAudit,
  ): Promise<void> {
    await this.step(viewer, meta, target.id, async (ctx) => {
      assertStep(ctx.audit, 'cancel');
      await move(ctx, target, 'cancel', { status: 'cancelled', cancelReason: input.reason });
    });
  }

  /** Una observación u oportunidad de mejora se vuelve acción de mejora (decisión 3). */
  async findingAction(
    viewer: QmsViewer,
    meta: RequestMeta,
    findingId: string,
    input: FindingAction,
  ): Promise<QmsCodeResponse> {
    if (!hasUnconditionalPermission(viewer.ability, 'qms.action.manage')) throw permissionDenied();
    const actor = qmsActorOf(viewer.principal, this.clock.now(), meta);
    return this.database.withTenant(viewer.principal, async (tx) => {
      const finding = await tx.qmsFinding.findFirst({
        where: { id: findingId, deletedAt: null },
        include: { audit: true, actions: { where: { deletedAt: null } } },
      });
      if (finding === null) throw qmsNotFound('El hallazgo no existe.');
      if (findingOpensNonconformity(findingTypeSchema.parse(finding.findingType))) {
        throw qmsConflict('Las acciones de una no conformidad se registran en la no conformidad.');
      }
      if (!['reported', 'closed'].includes(finding.audit.status)) {
        throw qmsConflict('Registre la acción después de emitir el informe.');
      }
      if (finding.actions.length > 0) throw qmsConflict('El hallazgo ya tiene su acción.');
      await assertPlan(tx, actor, input);
      return insertAction(tx, actor, {
        originType: 'audit',
        link: { ...NO_LINK, findingId: finding.id },
        description: input.description,
        responsibleId: input.responsible_id,
        dueOn: input.due_on,
        notes: null,
      });
    });
  }
}
