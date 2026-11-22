import { Inject, Injectable } from '@nestjs/common';
import type {
  NonconformityDetailResponse,
  NonconformityStatus,
  NonconformitySummary,
  ReportNonconformity,
} from '@arza/contracts';

import { hasUnconditionalPermission, type AppAbility } from '../../../platform/access/ability.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday } from '../../core/index.js';
import { incidentRefForQuality } from '../../sst/index.js';
import { actionViews } from './action-views.js';
import { detailView, nonconformityRefs, summaryView } from './nonconformity-views.js';
import { openNonconformity, type OpenedNonconformity } from './nonconformity-origins.js';
import { assertProcess, qmsActorOf, qmsInvalid, qmsNotFound } from './qms-support.js';

// No conformidades (B38, ficha 17.15): todo colaborador reporta y ve las que reportó; Calidad, la
// Dirección y el Auditor ven todas (decisión 3). Calidad abre la de un incidente de SST
// (decisión 5).

/** Quien consulta o reporta, con sus permisos. */
export interface QmsViewer {
  readonly principal: Principal;
  readonly ability: AppAbility;
}

async function linkedIncident(tx: TenantTransaction, incidentId: string) {
  const incident = await incidentRefForQuality(tx, incidentId);
  if (incident === null) throw qmsInvalid('El incidente de SST no existe.');
  const taken = await tx.qmsNonconformity.findFirst({
    where: { source: 'sst_incident', originId: incident.id },
  });
  if (taken !== null) throw qmsInvalid(`El incidente ya tiene la no conformidad ${taken.code}.`);
  return incident;
}

@Injectable()
export class Nonconformities {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Todas, de la más reciente a la más antigua. */
  async list(
    principal: Principal,
    status: NonconformityStatus | undefined,
  ): Promise<NonconformitySummary[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.qmsNonconformity.findMany({
        where: { deletedAt: null, ...(status === undefined ? {} : { status }) },
        orderBy: [{ code: 'desc' }],
        take: 500,
      });
      const refs = await nonconformityRefs(tx, rows);
      return rows.map((row) => summaryView(row, refs));
    });
  }

  /** Las que reportó la persona (Mi espacio). */
  async mine(principal: Principal): Promise<NonconformitySummary[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.qmsNonconformity.findMany({
        where: { deletedAt: null, reportedBy: principal.userId },
        orderBy: [{ code: 'desc' }],
        take: 200,
      });
      const refs = await nonconformityRefs(tx, rows);
      return rows.map((row) => summaryView(row, refs));
    });
  }

  async detail(principal: Principal, id: string): Promise<NonconformityDetailResponse> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const row = await tx.qmsNonconformity.findFirst({ where: { id, deletedAt: null } });
      if (row === null) throw qmsNotFound('La no conformidad no existe.');
      const actions = await tx.qmsAction.findMany({
        where: { nonconformityId: row.id, deletedAt: null },
        orderBy: { code: 'asc' },
      });
      return {
        nonconformity: detailView(row, await nonconformityRefs(tx, [row])),
        actions: await actionViews(tx, actions, today),
      };
    });
  }

  async report(
    viewer: QmsViewer,
    meta: RequestMeta,
    input: ReportNonconformity,
  ): Promise<OpenedNonconformity> {
    const actor = qmsActorOf(viewer.principal, this.clock.now(), meta);
    if (input.detected_on > bogotaToday(actor.at)) {
      throw qmsInvalid('La fecha de detección no puede ser futura.');
    }
    const fromIncident = input.sst_incident_id !== null;
    if (fromIncident && !hasUnconditionalPermission(viewer.ability, 'qms.nonconformity.manage')) {
      throw permissionDenied();
    }
    return this.database.withTenant(viewer.principal, async (tx) => {
      await assertProcess(tx, input.process_id);
      const incident =
        input.sst_incident_id === null ? null : await linkedIncident(tx, input.sst_incident_id);
      return openNonconformity(tx, actor, {
        source: incident === null ? 'report' : 'sst_incident',
        origin: incident,
        description: input.description,
        processId: input.process_id,
        detectedOn: input.detected_on,
      });
    });
  }
}
