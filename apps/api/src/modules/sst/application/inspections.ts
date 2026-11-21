import { Inject, Injectable } from '@nestjs/common';
import type {
  AnswerHomeInspection,
  ChecklistItem,
  Inspection,
  InspectionKind,
  RecordInspection,
  RequestHomeInspection,
  ReviewInspection,
} from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate } from '../../core/index.js';
import { activeEmployeeForSst, employeeIdOfUser } from '../../hr/index.js';
import { checkedAnswers, checklistOf, inspectionViews } from './inspection-views.js';
import {
  auditSst,
  emitSst,
  sstConflict,
  sstInvalid,
  sstNotFound,
  type SstActor,
  type Target,
} from './sst-support.js';

// Inspecciones (B37, decisión 11). SST registra las de instalaciones y emergencias; la del puesto
// en casa la pide SST, la responde el colaborador desde «Mi espacio» y SST la revisa.

@Injectable()
export class Inspections {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async checklist(principal: Principal, kind: InspectionKind): Promise<ChecklistItem[]> {
    return this.database.withTenant(principal, async (tx) => checklistOf(tx, kind));
  }

  async list(principal: Principal): Promise<Inspection[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.sstInspection.findMany({
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 300,
      });
      return inspectionViews(tx, rows);
    });
  }

  async record(principal: Principal, meta: RequestMeta, input: RecordInspection): Promise<string> {
    const actor: SstActor = { ...principal, at: this.clock.now(), meta };
    if (input.inspected_on > bogotaToday(actor.at)) {
      throw sstInvalid('La fecha de la inspección no puede ser futura.');
    }
    return this.database.withTenant(principal, async (tx) => {
      const checked = await checkedAnswers(tx, input.kind, input.answers);
      const row = await tx.sstInspection.create({
        data: {
          tenantId: actor.tenantId,
          kind: input.kind,
          status: 'reviewed',
          place: input.place,
          inspectorId: actor.userId,
          inspectedOn: fromCalendarDate(input.inspected_on),
          answers: checked.answers,
          failed: checked.failed,
          findings: input.findings,
          reviewedBy: actor.userId,
        },
      });
      await auditSst(tx, actor, {
        action: 'sst.inspection.record',
        entityType: 'sst_inspection',
        entityId: row.id,
        changes: { kind: input.kind, inspected_on: input.inspected_on, failed: checked.failed },
      });
      return row.id;
    });
  }

  /** SST pide al colaborador la autoinspección de su puesto en casa; él recibe el aviso. */
  async requestHome(
    principal: Principal,
    meta: RequestMeta,
    input: RequestHomeInspection,
  ): Promise<string> {
    const actor: SstActor = { ...principal, at: this.clock.now(), meta };
    if (input.due_on < bogotaToday(actor.at)) {
      throw sstInvalid('La fecha límite no puede estar en el pasado.');
    }
    return this.database.withTenant(principal, async (tx) => {
      const employee = await activeEmployeeForSst(tx, input.employee_id);
      if (employee === null) throw sstInvalid('El colaborador no existe o no está activo.');
      const row = await tx.sstInspection.create({
        data: {
          tenantId: actor.tenantId,
          kind: 'home',
          status: 'requested',
          employeeId: employee.id,
          requestedBy: actor.userId,
          dueOn: fromCalendarDate(input.due_on),
        },
      });
      await auditSst(tx, actor, {
        action: 'sst.inspection.request_home',
        entityType: 'sst_inspection',
        entityId: row.id,
        changes: { employee_id: employee.id, due_on: input.due_on },
      });
      await emitSst(tx, actor, 'sst.task.assigned', {
        inspection_id: row.id,
        task: 'Autoinspección de su puesto de trabajo en casa',
        due_on: input.due_on,
        recipients: employee.userId === null ? [] : [employee.userId],
      });
      return row.id;
    });
  }

  /** El colaborador responde su autoinspección; solo la suya y solo una vez. */
  async answerHome(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: AnswerHomeInspection,
  ): Promise<void> {
    const actor: SstActor = { ...principal, at: this.clock.now(), meta };
    await this.database.withTenant(principal, async (tx) => {
      const own = await employeeIdOfUser(tx, actor.userId);
      if (own === null) throw sstNotFound('La autoinspección no existe.');
      const row = await tx.sstInspection.findFirst({
        where: { id: target.id, kind: 'home', employeeId: own, deletedAt: null },
      });
      if (row === null) throw sstNotFound('La autoinspección no existe.');
      if (row.status !== 'requested') throw sstConflict('La autoinspección ya fue respondida.');
      const checked = await checkedAnswers(tx, 'home', input.answers);
      const updated = await tx.sstInspection.updateMany({
        where: { id: row.id, version: target.version, status: 'requested' },
        data: {
          status: 'submitted',
          place: input.place,
          inspectorId: actor.userId,
          inspectedOn: fromCalendarDate(bogotaToday(actor.at)),
          answers: checked.answers,
          failed: checked.failed,
        },
      });
      if (updated.count !== 1) throw versionConflict();
      await auditSst(tx, actor, {
        action: 'sst.inspection.answer_home',
        entityType: 'sst_inspection',
        entityId: row.id,
        changes: { status: { from: 'requested', to: 'submitted' }, failed: checked.failed },
      });
    });
  }

  /** SST revisa la autoinspección y deja sus hallazgos. */
  async review(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: ReviewInspection,
  ): Promise<void> {
    const actor: SstActor = { ...principal, at: this.clock.now(), meta };
    await this.database.withTenant(principal, async (tx) => {
      const row = await tx.sstInspection.findFirst({ where: { id: target.id, deletedAt: null } });
      if (row === null) throw sstNotFound('La inspección no existe.');
      if (row.status !== 'submitted')
        throw sstConflict('Solo se revisa una autoinspección respondida.');
      const updated = await tx.sstInspection.updateMany({
        where: { id: row.id, version: target.version, status: 'submitted' },
        data: { status: 'reviewed', findings: input.findings, reviewedBy: actor.userId },
      });
      if (updated.count !== 1) throw versionConflict();
      await auditSst(tx, actor, {
        action: 'sst.inspection.review',
        entityType: 'sst_inspection',
        entityId: row.id,
        changes: { status: { from: 'submitted', to: 'reviewed' } },
      });
    });
  }
}
