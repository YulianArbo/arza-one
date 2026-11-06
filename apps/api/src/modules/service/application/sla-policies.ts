import { Inject, Injectable } from '@nestjs/common';
import {
  slaCalendarSchema,
  ticketPrioritySchema,
  type SlaCalendar,
  type SlaPolicy as SlaPolicyView,
  type SlaPolicyListResponse,
  type SlaPolicyRequest,
  type TicketPriority,
} from '@arza/contracts';

import type { SlaPolicy } from '../../../generated/prisma/client.js';
import { hasPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  recordServiceChange,
  serviceActorOf,
  serviceNotFound,
  type ServiceTarget,
} from './service-support.js';

// Acuerdos de tiempo por prioridad (wf_sla_policies, decisión 2 del B28): horas para la primera
// respuesta y para la solución, y si el reloj cuenta horas hábiles o corre las 24 horas. Cada
// empresa nace con los de abajo; Servicio al cliente los cambia. Un cambio vale para los tiquetes
// que se registren o cambien de prioridad desde entonces.

interface DefaultPolicy {
  readonly firstResponseHours: number;
  readonly resolutionHours: number;
  readonly calendar: SlaCalendar;
}

export const DEFAULT_POLICIES: Readonly<Record<TicketPriority, DefaultPolicy>> = {
  critical: { firstResponseHours: 1, resolutionHours: 4, calendar: 'continuous' },
  high: { firstResponseHours: 4, resolutionHours: 16, calendar: 'business' },
  medium: { firstResponseHours: 8, resolutionHours: 40, calendar: 'business' },
  low: { firstResponseHours: 16, resolutionHours: 80, calendar: 'business' },
};

const PRIORITY_ORDER = Object.keys(DEFAULT_POLICIES) as TicketPriority[];

/** El acuerdo de la prioridad; si la empresa aún no lo tiene, lo crea con el de fábrica. */
export async function policyFor(
  tx: TenantTransaction,
  tenantId: string,
  priority: TicketPriority,
): Promise<SlaPolicy> {
  const found = await tx.slaPolicy.findFirst({ where: { priority, deletedAt: null } });
  if (found !== null) return found;
  const preset = DEFAULT_POLICIES[priority];
  await tx.slaPolicy.createMany({
    data: [{ tenantId, priority, ...preset }],
    skipDuplicates: true,
  });
  return tx.slaPolicy.findFirstOrThrow({ where: { priority, deletedAt: null } });
}

export function policyView(policy: SlaPolicy): SlaPolicyView {
  return {
    id: policy.id,
    priority: ticketPrioritySchema.parse(policy.priority),
    first_response_hours: policy.firstResponseHours.toNumber(),
    resolution_hours: policy.resolutionHours.toNumber(),
    calendar: slaCalendarSchema.parse(policy.calendar),
    version: policy.version,
  };
}

/** Semilla de la mesa de ayuda: los acuerdos de fábrica que falten en cada empresa. */
export async function seedService(
  database: Pick<DatabaseService, 'withTenant'>,
  tenantIds: readonly string[],
): Promise<void> {
  for (const tenantId of tenantIds) {
    await database.withTenant({ tenantId, userId: null }, async (tx) => {
      for (const priority of PRIORITY_ORDER) await policyFor(tx, tenantId, priority);
    });
  }
}

@Injectable()
export class SlaPoliciesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal, ability: AppAbility): Promise<SlaPolicyListResponse> {
    const policies = await this.database.withTenant(principal, async (tx) => {
      const all: SlaPolicy[] = [];
      for (const priority of PRIORITY_ORDER) {
        all.push(await policyFor(tx, principal.tenantId, priority));
      }
      return all;
    });
    return {
      data: policies.map(policyView),
      can_manage: hasPermission(ability, 'service.sla.manage'),
    };
  }

  async update(
    principal: Principal,
    target: ServiceTarget,
    input: SlaPolicyRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = serviceActorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const policy = await tx.slaPolicy.findFirst({ where: { id: target.id, deletedAt: null } });
      if (policy === null) throw serviceNotFound('El acuerdo de tiempo');
      const { count } = await tx.slaPolicy.updateMany({
        where: { id: target.id, version: target.version, deletedAt: null },
        data: {
          firstResponseHours: input.first_response_hours,
          resolutionHours: input.resolution_hours,
          calendar: input.calendar,
        },
      });
      if (count === 0) throw versionConflict();
      const before = policyView(policy);
      await recordServiceChange(tx, actor, {
        action: 'service.sla.update',
        event: 'service.sla.updated',
        entityType: 'wf_sla_policy',
        entityId: policy.id,
        changes: {
          priority: policy.priority,
          first_response_hours: [before.first_response_hours, input.first_response_hours],
          resolution_hours: [before.resolution_hours, input.resolution_hours],
          calendar: [before.calendar, input.calendar],
        },
        payload: { priority: policy.priority },
      });
    });
  }
}
