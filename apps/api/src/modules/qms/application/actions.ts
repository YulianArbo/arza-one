import { Inject, Injectable } from '@nestjs/common';
import {
  ACCEPTS_ACTIONS,
  ACTION_LOG_COLUMNS,
  actionTypeOf,
  nonconformityStatusSchema,
  type ActionOrigin,
  type ActionStatus,
  type CreateQmsAction,
  type QmsAction,
  type QmsCodeResponse,
  type QmsRef,
  type UpdateQmsAction,
} from '@arza/contracts';

import { hasUnconditionalPermission } from '../../../platform/access/ability.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { toCsv } from '../../../platform/export/csv.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate, nextBusinessCode } from '../../core/index.js';
import { activeCollaborators } from '../../iam/index.js';
import { actionLogRow, actionViews } from './action-views.js';
import type { QmsViewer } from './nonconformities.js';
import {
  assertPerson,
  assertProcess,
  auditQms,
  emitQms,
  qmsActorOf,
  qmsConflict,
  qmsInvalid,
  qmsNotFound,
  type QmsActor,
  type Target,
} from './qms-support.js';

// Acciones correctivas y de mejora y su bitácora (B38, decisión 10; FT-SGC-005 y RE-SGC-002).
// Calidad las registra y edita mientras están abiertas; cada responsable ve las suyas.

const ACTIONS = { name: 'Acciones correctivas y de mejora', prefix: 'AC', padding: 4 };

export interface ActionFilter {
  readonly status?: ActionStatus | undefined;
  readonly origin_type?: ActionOrigin | undefined;
}

function assertManager(viewer: QmsViewer): void {
  if (!hasUnconditionalPermission(viewer.ability, 'qms.action.manage')) throw permissionDenied();
}

async function originLink(tx: TenantTransaction, input: CreateQmsAction) {
  if (input.origin_type === 'nonconformity') {
    const nc = await tx.qmsNonconformity.findFirst({
      where: { id: input.origin_id ?? '', deletedAt: null },
    });
    if (nc === null) throw qmsInvalid('La no conformidad no existe.');
    if (!ACCEPTS_ACTIONS.includes(nonconformityStatusSchema.parse(nc.status))) {
      throw qmsConflict('Registre las acciones después del análisis de causa.');
    }
    return { nonconformityId: nc.id, riskId: null, processId: null };
  }
  if (input.origin_type === 'risk') {
    const risk = await tx.qmsRisk.findFirst({
      where: { id: input.origin_id ?? '', status: 'active', deletedAt: null },
    });
    if (risk === null) throw qmsInvalid('El riesgo no existe o está retirado.');
    return { nonconformityId: null, riskId: risk.id, processId: null };
  }
  await assertProcess(tx, input.process_id);
  return { nonconformityId: null, riskId: null, processId: input.process_id };
}

async function assertPlan(
  tx: TenantTransaction,
  actor: QmsActor,
  input: { responsible_id: string; due_on: string },
) {
  await assertPerson(tx, input.responsible_id);
  if (input.due_on < bogotaToday(actor.at)) {
    throw qmsInvalid('La fecha compromiso no puede estar en el pasado.');
  }
}

async function notifyAssigned(
  tx: TenantTransaction,
  actor: QmsActor,
  action: { id: string; code: string; responsibleId: string; dueOn: string },
) {
  await emitQms(tx, actor, 'qms.action.assigned', {
    action_id: action.id,
    code: action.code,
    due_on: action.dueOn,
    recipients: [action.responsibleId],
  });
}

@Injectable()
export class Actions {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** La bitácora completa (RE-SGC-002), de la más reciente a la más antigua. */
  async list(principal: Principal, filter: ActionFilter): Promise<QmsAction[]> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.qmsAction.findMany({
        where: {
          deletedAt: null,
          ...(filter.status === undefined ? {} : { status: filter.status }),
          ...(filter.origin_type === undefined ? {} : { originType: filter.origin_type }),
        },
        orderBy: { code: 'desc' },
        take: 1000,
      });
      return actionViews(tx, rows, today);
    });
  }

  /** Cuentas internas activas, para elegir responsables. */
  async people(principal: Principal): Promise<QmsRef[]> {
    return this.database.withTenant(principal, async (tx) =>
      (await activeCollaborators(tx)).map((person) => ({
        id: person.id,
        name: person.displayName ?? person.email,
      })),
    );
  }

  /** Las acciones a cargo de la persona (Mi espacio). */
  async mine(principal: Principal): Promise<QmsAction[]> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.qmsAction.findMany({
        where: { deletedAt: null, responsibleId: principal.userId },
        orderBy: [{ dueOn: 'asc' }, { code: 'asc' }],
        take: 200,
      });
      return actionViews(tx, rows, today);
    });
  }

  /** La bitácora en CSV para Excel, con la huella de la descarga en la auditoría. */
  async export(
    principal: Principal,
    meta: RequestMeta,
  ): Promise<{ readonly fileName: string; readonly content: string }> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    const actions = await this.list(principal, {});
    const content = toCsv(ACTION_LOG_COLUMNS, actions.map(actionLogRow));
    await this.database.withTenant(principal, async (tx) => {
      await auditQms(tx, actor, {
        action: 'qms.action.export',
        entityType: 'qms_action',
        entityId: actor.tenantId,
        changes: { rows: actions.length },
      });
    });
    return { fileName: `bitacora-acciones-${bogotaToday(actor.at)}.csv`, content };
  }

  async create(
    viewer: QmsViewer,
    meta: RequestMeta,
    input: CreateQmsAction,
  ): Promise<QmsCodeResponse> {
    assertManager(viewer);
    const actor = qmsActorOf(viewer.principal, this.clock.now(), meta);
    return this.database.withTenant(viewer.principal, async (tx) => {
      const link = await originLink(tx, input);
      await assertPlan(tx, actor, input);
      const code = await nextBusinessCode(tx, 'qms.action', actor.at, ACTIONS);
      const row = await tx.qmsAction.create({
        data: {
          tenantId: actor.tenantId,
          code,
          originType: input.origin_type,
          ...link,
          actionType: actionTypeOf(input.origin_type),
          description: input.description,
          responsibleId: input.responsible_id,
          dueOn: fromCalendarDate(input.due_on),
          notes: input.notes,
        },
      });
      await auditQms(tx, actor, {
        action: 'qms.action.create',
        entityType: 'qms_action',
        entityId: row.id,
        changes: { code, origin_type: input.origin_type, due_on: input.due_on },
      });
      await notifyAssigned(tx, actor, { ...row, dueOn: input.due_on });
      return { id: row.id, code };
    });
  }

  /** Mientras está abierta, Calidad ajusta el plan; un nuevo responsable recibe el aviso. */
  async update(
    viewer: QmsViewer,
    meta: RequestMeta,
    target: Target,
    input: UpdateQmsAction,
  ): Promise<void> {
    assertManager(viewer);
    const actor = qmsActorOf(viewer.principal, this.clock.now(), meta);
    await this.database.withTenant(viewer.principal, async (tx) => {
      const row = await tx.qmsAction.findFirst({ where: { id: target.id, deletedAt: null } });
      if (row === null) throw qmsNotFound('La acción no existe.');
      if (row.status !== 'open') throw qmsConflict('Solo se edita una acción abierta.');
      await assertPlan(tx, actor, input);
      const data = {
        description: input.description,
        responsibleId: input.responsible_id,
        dueOn: fromCalendarDate(input.due_on),
        notes: input.notes,
      };
      const updated = await tx.qmsAction.updateMany({
        where: { id: row.id, version: target.version, status: 'open' },
        data: { ...data, escalatedOn: null },
      });
      if (updated.count !== 1) throw versionConflict();
      const audit = (value: { responsibleId: string; dueOn: Date }) => ({
        responsible_id: value.responsibleId,
        due_on: value.dueOn.toISOString().slice(0, 10),
      });
      await auditQms(tx, actor, {
        action: 'qms.action.update',
        entityType: 'qms_action',
        entityId: row.id,
        changes: changesBetween(audit(row), audit(data)),
      });
      if (row.responsibleId !== input.responsible_id) {
        await notifyAssigned(tx, actor, { ...row, ...data, dueOn: input.due_on });
      }
    });
  }
}
