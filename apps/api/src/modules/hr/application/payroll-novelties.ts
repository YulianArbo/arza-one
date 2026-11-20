import { Inject, Injectable } from '@nestjs/common';
import {
  AUTOMATIC_CONCEPT_CODES,
  NOVELTY_CONCEPTS_CATALOG,
  type NoveltyConceptOption,
  type RegisterNovelty,
} from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { activeCatalogOptions, isActiveCatalogCode } from '../../core/index.js';
import {
  auditHr,
  hrConflict,
  hrInvalid,
  hrNotFound,
  lockKey,
  requireActiveEmployee,
  type HrActor,
} from './hr-support.js';
import { isClosed } from './payroll-periods.js';

// Novedades que registra Talento humano a mano (B36, decisión 6): bonificaciones, auxilios,
// descuentos, ingresos y otras del catálogo. Las automáticas (vacaciones, licencias, horas extras y
// retiro) las genera la plataforma y no se registran a mano. Solo se cambian con el mes abierto.

interface NoveltyTarget {
  readonly id: string;
  readonly version: number;
}

async function assertManualConcept(tx: TenantTransaction, concept: string): Promise<void> {
  if (AUTOMATIC_CONCEPT_CODES.includes(concept)) {
    throw hrInvalid(
      'Ese concepto lo genera la plataforma: registre la ausencia o las horas extras.',
    );
  }
  if (!(await isActiveCatalogCode(tx, NOVELTY_CONCEPTS_CATALOG, concept))) {
    throw hrInvalid('Seleccione un concepto de la lista.');
  }
}

async function assertOpen(tx: TenantTransaction, period: string): Promise<void> {
  if (await isClosed(tx, period)) {
    throw hrConflict('El mes ya está cerrado: registre la novedad en el mes siguiente.');
  }
}

async function replayed(
  tx: TenantTransaction,
  tenantId: string,
  requestKey: string,
  input: RegisterNovelty,
): Promise<string | null> {
  await lockKey(tx, `hr.novelty:${tenantId}:${requestKey}`);
  const existing = await tx.hrPayrollNovelty.findUnique({
    where: { tenantId_requestKey: { tenantId, requestKey } },
  });
  if (existing === null) return null;
  const same =
    existing.period === input.period &&
    existing.employeeId === input.employee_id &&
    existing.concept === input.concept &&
    existing.quantity.toFixed(2) === Number(input.quantity).toFixed(2);
  if (!same) throw idempotencyKeyReused();
  return existing.id;
}

@Injectable()
export class PayrollNovelties {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async concepts(principal: Principal): Promise<NoveltyConceptOption[]> {
    return this.database.withTenant(principal, async (tx) => {
      const options = await activeCatalogOptions(tx, NOVELTY_CONCEPTS_CATALOG);
      return options.map(({ code, label }) => ({
        code,
        label,
        automatic: AUTOMATIC_CONCEPT_CODES.includes(code),
      }));
    });
  }

  async register(
    principal: Principal,
    meta: RequestMeta,
    requestKey: string,
    input: RegisterNovelty,
  ): Promise<string> {
    const actor: HrActor = { ...principal, at: this.clock.now(), meta };
    return this.database.withTenant(principal, async (tx) => {
      const previous = await replayed(tx, actor.tenantId, requestKey, input);
      if (previous !== null) return previous;
      await assertManualConcept(tx, input.concept);
      await requireActiveEmployee(tx, input.employee_id);
      await lockKey(tx, `hr.payroll.period:${actor.tenantId}:${input.period}`);
      await assertOpen(tx, input.period);
      const row = await tx.hrPayrollNovelty.create({
        data: {
          tenantId: actor.tenantId,
          period: input.period,
          employeeId: input.employee_id,
          concept: input.concept,
          quantity: input.quantity,
          unit: input.unit,
          amount: input.amount,
          sourceEntity: 'manual',
          note: input.note,
          requestKey,
        },
      });
      await auditHr(tx, actor, {
        action: 'hr.payroll_novelty.create',
        entityType: 'hr_payroll_novelty',
        entityId: row.id,
        changes: { period: input.period, concept: input.concept, quantity: input.quantity },
      });
      return row.id;
    });
  }

  /** Retira una novedad manual del mes abierto. Las automáticas siguen a su origen. */
  async remove(principal: Principal, meta: RequestMeta, target: NoveltyTarget): Promise<void> {
    const actor: HrActor = { ...principal, at: this.clock.now(), meta };
    await this.database.withTenant(principal, async (tx) => {
      const row = await tx.hrPayrollNovelty.findFirst({
        where: { id: target.id, deletedAt: null },
      });
      if (row === null) throw hrNotFound('La novedad no existe.');
      if (row.version !== target.version) throw versionConflict();
      if (row.sourceEntity !== 'manual') {
        throw hrConflict('Esta novedad la generó la plataforma y no se retira a mano.');
      }
      await lockKey(tx, `hr.payroll.period:${actor.tenantId}:${row.period}`);
      await assertOpen(tx, row.period);
      const updated = await tx.hrPayrollNovelty.updateMany({
        where: { id: row.id, version: row.version, deletedAt: null },
        data: { deletedAt: actor.at },
      });
      if (updated.count !== 1) throw versionConflict();
      await auditHr(tx, actor, {
        action: 'hr.payroll_novelty.delete',
        entityType: 'hr_payroll_novelty',
        entityId: row.id,
        changes: { period: row.period, concept: row.concept },
      });
    });
  }
}
