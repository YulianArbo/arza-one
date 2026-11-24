import { Inject, Injectable } from '@nestjs/common';
import {
  canPrivacyIncidentStep,
  INCIDENT_RULES,
  privacyIncidentStatusSchema,
  type AddIncidentMeasure,
  type ClosePrivacyIncident,
  type CreatePrivacyIncident,
  type NotifyHolders,
  type PrivacyIncident as PrivacyIncidentView,
  type PrivacyIncidentAction,
  type PrivacyIncidentListQuery,
  type PrivacyIncidentListResponse,
  type PrivacyIncidentNote,
  type ReportPrivacyIncident,
  type UpdatePrivacyIncident,
} from '@arza/contracts';

import type { Prisma, PrivacyIncident } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  bogotaToday,
  businessDeadline,
  fromCalendarDate,
  nextBusinessCode,
} from '../../core/index.js';
import { incidentDetail, incidentSummary } from './incident-views.js';
import {
  actorOf,
  auditPrivacy,
  recordPrivacyChange,
  type PrivacyActor,
} from './privacy-support.js';
import { incidentDateInvalid, incidentNotFound, incidentStepInvalid } from './request-messages.js';

// Incidentes de seguridad con datos personales (B42; numeral 15.7; decisión 9): se registran con
// su plazo de 15 días hábiles para reportar a la SIC, se contienen, se reportan, se informa a los
// titulares cuando corresponde y se cierra con el reporte hecho o con el motivo para no reportar.

const INCIDENT_SEQUENCE = 'prv.incident';
const INCIDENT_CODES = {
  name: 'Incidentes de datos personales',
  prefix: 'IDP',
  padding: 4,
} as const;

const STEP_MESSAGES: Record<PrivacyIncidentAction, string> = {
  update: 'Un incidente reportado o cerrado ya no se edita; registre las medidas en la bitácora.',
  contain: 'El incidente ya se había contenido o reportado.',
  report: 'El incidente ya se reportó o está cerrado.',
  notify_holders: 'Un incidente cerrado ya no admite cambios.',
  add_measure: 'Un incidente cerrado ya no admite medidas nuevas.',
  close: 'El incidente ya está cerrado.',
};

function assertStep(row: PrivacyIncident, action: PrivacyIncidentAction): void {
  if (!canPrivacyIncidentStep(action, privacyIncidentStatusSchema.parse(row.status))) {
    throw incidentStepInvalid(STEP_MESSAGES[action]);
  }
}

function assertDetected(detectedAt: string, at: Date): Date {
  const detected = new Date(detectedAt);
  if (detected > at) throw incidentDateInvalid();
  return detected;
}

function assertDayBetween(row: PrivacyIncident, day: string, at: Date): Date {
  if (day > bogotaToday(at) || day < bogotaToday(row.detectedAt)) throw incidentDateInvalid();
  return fromCalendarDate(day);
}

async function sicDueOn(tx: TenantTransaction, detected: Date): Promise<Date> {
  const day = await businessDeadline(
    tx,
    bogotaToday(detected),
    INCIDENT_RULES.sicReportBusinessDays,
  );
  return fromCalendarDate(day);
}

function fieldsOf(input: CreatePrivacyIncident | UpdatePrivacyIncident) {
  return {
    title: input.title,
    description: input.description,
    affectedCount: input.affected_count,
    dataCategories: input.data_categories,
    projectIncidentRef: input.project_incident_ref,
  };
}

@Injectable()
export class IncidentsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(
    principal: Principal,
    query: PrivacyIncidentListQuery,
  ): Promise<PrivacyIncidentListResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.privacyIncident.findMany({
        where: { deletedAt: null, ...(query.status === undefined ? {} : { status: query.status }) },
        orderBy: { detectedAt: 'desc' },
        take: 200,
      });
      const now = this.clock.now();
      return { data: rows.map((row) => incidentSummary(row, now)) };
    });
  }

  async get(principal: Principal, id: string): Promise<PrivacyIncidentView> {
    return this.database.withTenant(principal, async (tx) => {
      const row = await tx.privacyIncident.findFirst({
        where: { id, deletedAt: null },
        include: { measures: { where: { deletedAt: null }, orderBy: { takenOn: 'asc' } } },
      });
      if (row === null) throw incidentNotFound();
      return incidentDetail(tx, row, this.clock.now());
    });
  }

  async create(
    principal: Principal,
    input: CreatePrivacyIncident,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = actorOf(principal, meta, this.clock.now());
    const detected = assertDetected(input.detected_at, actor.at);
    return this.database.withTenant(principal, async (tx) => {
      const row = await tx.privacyIncident.create({
        data: {
          tenantId: actor.tenantId,
          code: await nextBusinessCode(tx, INCIDENT_SEQUENCE, actor.at, INCIDENT_CODES),
          ...fieldsOf(input),
          detectedAt: detected,
          sicDueOn: await sicDueOn(tx, detected),
        },
      });
      await recordPrivacyChange(tx, actor, {
        action: 'privacy.incident.create',
        event: 'privacy.incident.registered',
        entityType: 'prv_incident',
        entityId: row.id,
        changes: { code: row.code, affected_count: row.affectedCount },
        payload: { id: row.id, code: row.code },
      });
      return row.id;
    });
  }

  async update(
    principal: Principal,
    target: { readonly id: string; readonly version: number },
    input: UpdatePrivacyIncident,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, meta, target, async (tx, actor, row) => {
      assertStep(row, 'update');
      const detected = assertDetected(input.detected_at, actor.at);
      return this.apply(tx, actor, row, 'privacy.incident.update', {
        ...fieldsOf(input),
        detectedAt: detected,
        sicDueOn: await sicDueOn(tx, detected),
        warnedFor: null,
        breachedFor: null,
      });
    });
  }

  async contain(
    principal: Principal,
    target: { readonly id: string; readonly version: number },
    input: PrivacyIncidentNote,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, meta, target, async (tx, actor, row) => {
      assertStep(row, 'contain');
      return this.apply(tx, actor, row, 'privacy.incident.contain', {
        status: 'contained',
        containedAt: actor.at,
        containmentNote: input.note,
      });
    });
  }

  async report(
    principal: Principal,
    target: { readonly id: string; readonly version: number },
    input: ReportPrivacyIncident,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, meta, target, async (tx, actor, row) => {
      assertStep(row, 'report');
      return this.apply(tx, actor, row, 'privacy.incident.report', {
        status: 'reported',
        reportedOn: assertDayBetween(row, input.reported_on, actor.at),
        sicReference: input.reference,
      });
    });
  }

  async notifyHolders(
    principal: Principal,
    target: { readonly id: string; readonly version: number },
    input: NotifyHolders,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, meta, target, async (tx, actor, row) => {
      assertStep(row, 'notify_holders');
      return this.apply(tx, actor, row, 'privacy.incident.notify_holders', {
        holdersNotifiedOn: assertDayBetween(row, input.notified_on, actor.at),
        holdersNotice: input.note,
      });
    });
  }

  async addMeasure(
    principal: Principal,
    target: { readonly id: string; readonly version: number },
    input: AddIncidentMeasure,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, meta, target, async (tx, actor, row) => {
      assertStep(row, 'add_measure');
      const takenOn = assertDayBetween(row, input.taken_on, actor.at);
      await tx.privacyIncidentMeasure.create({
        data: {
          tenantId: actor.tenantId,
          incidentId: row.id,
          description: input.description,
          takenOn,
        },
      });
      // La medida también cambia la versión del incidente: otra persona no lo pisa.
      return this.apply(tx, actor, row, 'privacy.incident.measure_add', { updatedAt: actor.at });
    });
  }

  async close(
    principal: Principal,
    target: { readonly id: string; readonly version: number },
    input: ClosePrivacyIncident,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, meta, target, async (tx, actor, row) => {
      assertStep(row, 'close');
      if (row.reportedOn === null && input.not_reportable_reason === null) {
        throw incidentStepInvalid(
          'Para cerrar sin reportar a la SIC, escriba por qué no se reporta.',
        );
      }
      return this.apply(tx, actor, row, 'privacy.incident.close', {
        status: 'closed',
        closedAt: actor.at,
        notReportableReason: row.reportedOn === null ? input.not_reportable_reason : null,
      });
    });
  }

  private async apply(
    tx: TenantTransaction,
    actor: PrivacyActor,
    row: PrivacyIncident,
    action: string,
    data: Prisma.PrivacyIncidentUpdateInput,
  ): Promise<void> {
    const after = await tx.privacyIncident.update({
      where: { id: row.id },
      data,
    });
    await auditPrivacy(tx, actor, {
      action,
      entityType: 'prv_incident',
      entityId: row.id,
      changes: { code: row.code, status: [row.status, after.status] },
    });
  }

  private async run(
    principal: Principal,
    meta: RequestMeta,
    target: { readonly id: string; readonly version: number },
    step: (tx: TenantTransaction, actor: PrivacyActor, row: PrivacyIncident) => Promise<void>,
  ): Promise<void> {
    const actor = actorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      await tx.$queryRaw`SELECT id FROM prv_incidents WHERE id = ${target.id}::uuid FOR UPDATE`;
      const row = await tx.privacyIncident.findFirst({ where: { id: target.id, deletedAt: null } });
      if (row === null) throw incidentNotFound();
      if (row.version !== target.version) throw versionConflict();
      await step(tx, actor, row);
    });
  }
}
