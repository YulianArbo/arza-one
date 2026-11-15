import { Inject, Injectable } from '@nestjs/common';
import {
  PARAMETER_DEFINITIONS,
  PARAMETER_VALUE_SCHEMAS,
  discountCapSchema,
  isParameterKey,
  pqrsfTermsSchema,
  purchaseTiersSchema,
  workScheduleSchema,
  type CreateParameterVersionRequest,
  type DiscountCap,
  type PqrsfTerms,
  type PurchaseTiers,
  type ParameterHistoryResponse,
  type ParameterKey,
  type ParameterSummary,
  type ParameterValue,
  type ParameterVersion,
  type WorkSchedule,
} from '@arza/contracts';

import type { Parameter } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { peopleById } from '../../iam/index.js';
import { bogotaToday, fromCalendarDate, toCalendarDate } from '../domain/calendar-date.js';
import {
  currentAndScheduled,
  previousValidTo,
  validFromProblem,
} from '../domain/parameter-policy.js';
import { auditCore } from './core-audit.js';
import {
  parameterUnknown,
  parameterValidFromInvalid,
  parameterValueInvalid,
} from './core-messages.js';

interface Dated {
  readonly row: Parameter;
  readonly validFrom: string;
  readonly validTo: string | null;
}

/** Vigencias de un parámetro, de la más reciente a la más antigua. */
async function versionsOf(tx: TenantTransaction, key: string): Promise<Dated[]> {
  const rows = await tx.parameter.findMany({
    where: { key, deletedAt: null },
    orderBy: { validFrom: 'desc' },
  });
  return rows.map((row) => ({
    row,
    validFrom: toCalendarDate(row.validFrom),
    validTo: row.validTo === null ? null : toCalendarDate(row.validTo),
  }));
}

/** El valor guardado, leído con el esquema de su clave. */
function valueOf(key: ParameterKey, row: Parameter): ParameterValue {
  return PARAMETER_VALUE_SCHEMAS[key].parse(row.value);
}

async function viewsOf(tx: TenantTransaction, key: ParameterKey, versions: readonly Dated[]) {
  const ids = versions.flatMap(({ row }) => (row.createdBy === null ? [] : [row.createdBy]));
  const people = await peopleById(tx, ids);
  return (version: Dated): ParameterVersion => {
    const person = version.row.createdBy === null ? undefined : people.get(version.row.createdBy);
    return {
      id: version.row.id,
      value: valueOf(key, version.row),
      valid_from: version.validFrom,
      valid_to: version.validTo,
      created_at: version.row.createdAt.toISOString(),
      created_by:
        person === undefined ? null : { id: person.id, name: person.displayName ?? person.email },
    };
  };
}

/** Cierra la vigencia anterior el día antes y crea la nueva; la anterior queda intacta. */
async function saveVersion(
  tx: TenantTransaction,
  tenantId: string,
  key: ParameterKey,
  input: CreateParameterVersionRequest,
  latest: Dated | undefined,
): Promise<{ id: string; previousTo: string | null }> {
  const previousTo = latest === undefined ? null : previousValidTo(input.valid_from);
  if (latest !== undefined && previousTo !== null) {
    await tx.parameter.update({
      where: { id: latest.row.id },
      data: { validTo: fromCalendarDate(previousTo) },
    });
  }
  const created = await tx.parameter.create({
    data: { tenantId, key, value: input.value, validFrom: fromCalendarDate(input.valid_from) },
  });
  return { id: created.id, previousTo };
}

function knownKey(key: string): ParameterKey {
  if (!isParameterKey(key)) throw parameterUnknown();
  return key;
}

/**
 * Parámetros con vigencia (ficha 17.1). Un cambio nunca sobrescribe: crea una vigencia nueva,
 * cierra la anterior el día antes y deja auditoría con el valor anterior y el nuevo.
 */
@Injectable()
export class ParametersUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal): Promise<ParameterSummary[]> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const summaries: ParameterSummary[] = [];
      for (const [key, definition] of Object.entries(PARAMETER_DEFINITIONS)) {
        if (!isParameterKey(key)) continue;
        const versions = await versionsOf(tx, key);
        const view = await viewsOf(tx, key, versions);
        const { current, scheduled } = currentAndScheduled(versions, today);
        summaries.push({
          key,
          ...definition,
          current: current === null ? null : view(current),
          scheduled: scheduled === null ? null : view(scheduled),
        });
      }
      return summaries;
    });
  }

  async history(principal: Principal, key: string): Promise<ParameterHistoryResponse> {
    const known = knownKey(key);
    return this.database.withTenant(principal, async (tx) => {
      const versions = await versionsOf(tx, known);
      const view = await viewsOf(tx, known, versions);
      return { key: known, label: PARAMETER_DEFINITIONS[known].label, data: versions.map(view) };
    });
  }

  async createVersion(
    principal: Principal,
    key: string,
    input: CreateParameterVersionRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const known = knownKey(key);
    if (!PARAMETER_VALUE_SCHEMAS[known].safeParse(input.value).success) {
      throw parameterValueInvalid();
    }
    const at = this.clock.now();
    await this.database.withTenant(principal, async (tx) => {
      const [latest] = await versionsOf(tx, known);
      const problem = validFromProblem(
        input.valid_from,
        bogotaToday(at),
        latest?.validFrom ?? null,
      );
      if (problem !== null) throw parameterValidFromInvalid(problem);
      const created = await saveVersion(tx, principal.tenantId, known, input, latest);
      await auditCore(
        tx,
        { context: principal, meta, at },
        {
          action: 'core.parameter.update',
          entityType: 'parameter',
          entityId: created.id,
          changes: {
            key: known,
            value: {
              from: latest === undefined ? null : valueOf(known, latest.row),
              to: input.value,
            },
            valid_from: input.valid_from,
            previous_valid_to: created.previousTo,
          },
        },
      );
    });
  }
}

/** Horario laboral vigente en una fecha, para los días hábiles y las notificaciones. */
export async function workScheduleOn(
  tx: TenantTransaction,
  date: string,
): Promise<WorkSchedule | null> {
  const versions = await versionsOf(tx, 'work.schedule');
  const { current } = currentAndScheduled(versions, date);
  return current === null ? null : workScheduleSchema.parse(current.row.value);
}

/** Tope de descuento sin aprobación vigente en una fecha (B23); null si nunca se definió. */
export async function discountCapOn(
  tx: TenantTransaction,
  date: string,
): Promise<DiscountCap | null> {
  const versions = await versionsOf(tx, 'crm.discount_cap');
  const { current } = currentAndScheduled(versions, date);
  return current === null ? null : discountCapSchema.parse(current.row.value);
}

/** Plazos de respuesta de PQRSF vigentes ese día (B29), o null si la empresa no los tiene. */
export async function pqrsfTermsOn(
  tx: TenantTransaction,
  date: string,
): Promise<PqrsfTerms | null> {
  const versions = await versionsOf(tx, 'service.pqrsf_terms');
  const { current } = currentAndScheduled(versions, date);
  return current === null ? null : pqrsfTermsSchema.parse(current.row.value);
}

/** Topes de aprobación de compras vigentes ese día (B33), o null si la empresa no los tiene. */
export async function purchaseTiersOn(
  tx: TenantTransaction,
  date: string,
): Promise<PurchaseTiers | null> {
  const versions = await versionsOf(tx, 'purchase.approval_tiers');
  const { current } = currentAndScheduled(versions, date);
  return current === null ? null : purchaseTiersSchema.parse(current.row.value);
}
