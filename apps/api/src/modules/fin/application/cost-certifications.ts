import { Inject, Injectable } from '@nestjs/common';
import { COST_PHASES, type CostCertification, type CreateCostCertification } from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import { nextBusinessCode } from '../../core/index.js';
import { approvedHours, certifiableProjects, projectRefs } from '../../project/index.js';
import { Money, periodRange } from '../domain/ledger-rules.js';
import { recordInvalid } from './ledger-messages.js';
import { assertPeriodOpen, dateColumn, recordFinEvent, type FinActor } from './ledger-support.js';

// Certificación de costos de desarrollo (B32, decisión 6): las horas aprobadas del proyecto en el
// mes las trae Proyectos; el valor lo digita la persona, porque la plataforma aún no conoce el
// costo por hora (los salarios llegan con Talento humano).

@Injectable()
export class CostCertificationsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal): Promise<CostCertification[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.finCostCertification.findMany({
        where: { deletedAt: null },
        orderBy: [{ period: 'desc' }, { code: 'desc' }],
        take: 500,
      });
      const projects = await projectRefs(
        tx,
        rows.map((row) => row.projectId),
      );
      return rows.map((row) => {
        const project = projects.get(row.projectId);
        return {
          id: row.id,
          code: row.code,
          project: {
            id: row.projectId,
            code: project?.code ?? '—',
            name: project?.name ?? 'Proyecto',
          },
          period: row.period,
          hours: row.hours.toFixed(2),
          amount: row.amount.toFixed(2),
          phase: COST_PHASES.find((phase) => phase === row.phase) ?? 'development',
          created_at: row.createdAt.toISOString(),
        };
      });
    });
  }

  async projects(principal: Principal): Promise<{ id: string; code: string; name: string }[]> {
    return this.database.withTenant(principal, certifiableProjects);
  }

  async hours(principal: Principal, projectId: string, period: string): Promise<string> {
    return this.database.withTenant(principal, (tx) => hoursOf(tx, projectId, period));
  }

  async create(actor: FinActor, key: string, input: CreateCostCertification): Promise<string> {
    const at = this.clock.now();
    return this.database.withTenant(actor.principal, async (tx) => {
      const prior = await tx.finCostCertification.findFirst({ where: { requestKey: key } });
      if (prior !== null) {
        return prior.projectId === input.project_id && prior.period === input.period
          ? prior.id
          : reuseKey();
      }
      const { project, hours } = await certifiable(tx, input);
      const row = await tx.finCostCertification.create({
        data: {
          tenantId: actor.principal.tenantId,
          code: await nextBusinessCode(tx, 'fin.cost_certification', at, CODE),
          projectId: input.project_id,
          period: input.period,
          hours,
          amount: input.amount,
          phase: input.phase,
          requestKey: key,
          createdBy: actor.principal.userId,
        },
      });
      await recordFinEvent(tx, actor, at, {
        action: 'finance.cost_certification.create',
        event: 'fin.costcertification.created',
        entityType: 'fin_cost_certification',
        entityId: row.id,
        payload: { code: row.code, project_id: input.project_id, period: input.period },
        changes: {
          project_code: project.code,
          period: input.period,
          hours,
          amount: input.amount,
          phase: input.phase,
        },
      });
      return row.id;
    });
  }
}

const CODE = { name: 'Certificaciones de costos', prefix: 'CCD', padding: 4 };

/** El mes está abierto, el proyecto existe, aún no se certificó y tiene horas aprobadas. */
async function certifiable(
  tx: TenantTransaction,
  input: CreateCostCertification,
): Promise<{ project: { code: string }; hours: string }> {
  await assertPeriodOpen(tx, input.period);
  const project = (await projectRefs(tx, [input.project_id])).get(input.project_id);
  if (project === undefined) throw recordInvalid('Elija un proyecto de la empresa.');
  const taken = await tx.finCostCertification.count({
    where: { projectId: input.project_id, period: input.period, deletedAt: null },
  });
  if (taken > 0) throw recordInvalid('Ese proyecto ya tiene certificación en ese mes.');
  const hours = await hoursOf(tx, input.project_id, input.period);
  if (new Money(hours).isZero()) {
    throw recordInvalid('El proyecto no tiene horas aprobadas en ese mes.');
  }
  return { project, hours };
}

function reuseKey(): never {
  throw idempotencyKeyReused();
}

function hoursOf(tx: TenantTransaction, projectId: string, period: string): Promise<string> {
  const { from, to } = periodRange(period);
  return approvedHours(tx, projectId, dateColumn(from), dateColumn(to));
}
