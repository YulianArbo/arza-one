import { Inject, Injectable } from '@nestjs/common';
import {
  WARRANTY_DEFAULT_DAYS,
  type Warranty,
  type WarrantyListQuery,
  type WarrantyListResponse,
  type WarrantyRequest,
} from '@arza/contracts';

import type { SvcWarranty } from '../../../generated/prisma/client.js';
import { hasPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addDays, bogotaToday, fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { commercialParties } from '../../party/index.js';
import {
  deliverableRefs,
  onDeliverableAccepted,
  projectRefs,
  type DeliverableAccepted,
  type ProjectActor,
} from '../../project/index.js';
import {
  datesInvalid,
  recordServiceChange,
  serviceActorOf,
  serviceNotFound,
  type ServiceTarget,
} from './service-support.js';

// Garantías por entregable (B28, decisión 10; numeral 13.3 «deliverable.accepted inicia la
// garantía»). Cuando el cliente acepta un entregable, en la misma transacción nace su garantía de
// 90 días desde el día de la aceptación. Servicio al cliente ajusta su fin y su alcance. Un tiquete
// sobre un entregable con garantía vigente queda «en garantía».

const DEFAULT_SCOPE =
  'Corrección de fallas del entregable aceptado, sin costo, según el contrato y MN-SAC-001.';

function warrantyAudit(warranty: SvcWarranty) {
  return {
    project_id: warranty.projectId,
    deliverable_id: warranty.deliverableId,
    starts_on: toCalendarDate(warranty.startsOn),
    ends_on: toCalendarDate(warranty.endsOn),
  };
}

/** Oyente de Proyectos: el cliente aceptó un entregable. Repetirlo no crea otra garantía. */
async function startWarranty(
  tx: TenantTransaction,
  actor: ProjectActor,
  accepted: DeliverableAccepted,
): Promise<void> {
  const exists = await tx.svcWarranty.count({
    where: { deliverableId: accepted.deliverable.id, deletedAt: null },
  });
  if (exists > 0) return;
  const startsOn = bogotaToday(actor.at);
  const warranty = await tx.svcWarranty.create({
    data: {
      tenantId: actor.tenantId,
      projectId: accepted.project.id,
      deliverableId: accepted.deliverable.id,
      partyId: accepted.project.partyId,
      startsOn: fromCalendarDate(startsOn),
      endsOn: fromCalendarDate(addDays(startsOn, WARRANTY_DEFAULT_DAYS)),
      scope: DEFAULT_SCOPE,
    },
  });
  await recordServiceChange(tx, actor, {
    action: 'service.warranty.start',
    event: 'service.warranty.started',
    entityType: 'svc_warranty',
    entityId: warranty.id,
    changes: { project: accepted.project.code, ...warrantyAudit(warranty) },
    payload: { project_id: warranty.projectId, deliverable_id: warranty.deliverableId },
  });
}

export function followAcceptedDeliverables(): void {
  onDeliverableAccepted(startWarranty);
}

@Injectable()
export class WarrantiesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(
    principal: Principal,
    ability: AppAbility,
    query: WarrantyListQuery,
  ): Promise<WarrantyListResponse> {
    const today = fromCalendarDate(bogotaToday(this.clock.now()));
    const data = await this.database.withTenant(principal, async (tx) => {
      const activeFilter =
        query.active === undefined ? {} : { endsOn: query.active ? { gte: today } : { lt: today } };
      const rows = await tx.svcWarranty.findMany({
        where: { deletedAt: null, ...activeFilter },
        orderBy: [{ endsOn: 'asc' }, { id: 'asc' }],
        take: 500,
      });
      return this.views(tx, rows, today);
    });
    return { data, can_manage: hasPermission(ability, 'service.sla.manage') };
  }

  private async views(
    tx: TenantTransaction,
    rows: readonly SvcWarranty[],
    today: Date,
  ): Promise<Warranty[]> {
    const projects = await projectRefs(
      tx,
      rows.map((row) => row.projectId),
    );
    const deliverables = await deliverableRefs(
      tx,
      rows.map((row) => row.deliverableId),
    );
    const parties = await commercialParties(
      tx,
      rows.map((row) => row.partyId).filter((id): id is string => id !== null),
    );
    return rows.map((row) => {
      const project = projects.get(row.projectId);
      const party = row.partyId === null ? undefined : parties.get(row.partyId);
      return {
        id: row.id,
        project: {
          id: row.projectId,
          code: project?.code ?? '—',
          name: project?.name ?? 'Proyecto retirado',
        },
        deliverable: {
          id: row.deliverableId,
          name: deliverables.get(row.deliverableId)?.name ?? 'Entregable retirado',
        },
        party: party === undefined ? null : { id: party.id, name: party.name },
        starts_on: toCalendarDate(row.startsOn),
        ends_on: toCalendarDate(row.endsOn),
        scope: row.scope,
        active: row.endsOn >= today,
        version: row.version,
      };
    });
  }

  async update(
    principal: Principal,
    target: ServiceTarget,
    input: WarrantyRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = serviceActorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const warranty = await tx.svcWarranty.findFirst({
        where: { id: target.id, deletedAt: null },
      });
      if (warranty === null) throw serviceNotFound('La garantía');
      if (input.ends_on < toCalendarDate(warranty.startsOn)) {
        throw datesInvalid('La garantía no puede terminar antes de empezar.');
      }
      const { count } = await tx.svcWarranty.updateMany({
        where: { id: target.id, version: target.version, deletedAt: null },
        data: { endsOn: fromCalendarDate(input.ends_on), scope: input.scope },
      });
      if (count === 0) throw versionConflict();
      await recordServiceChange(tx, actor, {
        action: 'service.warranty.update',
        event: 'service.warranty.updated',
        entityType: 'svc_warranty',
        entityId: warranty.id,
        changes: {
          ...warrantyAudit(warranty),
          ends_on: [toCalendarDate(warranty.endsOn), input.ends_on],
          scope_changed: input.scope !== warranty.scope,
        },
        payload: { project_id: warranty.projectId, deliverable_id: warranty.deliverableId },
      });
    });
  }
}
