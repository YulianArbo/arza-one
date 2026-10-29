import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateTaxParameterVersionRequest,
  TaxParameterHistoryResponse,
  TaxParameterSummary,
  TaxParameterVersion,
} from '@arza/contracts';

import type { FinTaxParameter } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import {
  bogotaToday,
  currentAndScheduled,
  fromCalendarDate,
  previousValidTo,
  toCalendarDate,
  validFromProblem,
} from '../../core/index.js';
import { peopleById } from '../../iam/index.js';
import { taxLabelRequired, taxParameterUnknown, taxValidFromInvalid } from './fin-messages.js';

// Parámetros tributarios vigentes (numeral 12.4; B23). Como los parámetros del núcleo, un cambio
// nunca sobrescribe: crea una vigencia nueva, cierra la anterior el día antes y deja auditoría con
// la tarifa anterior y la nueva. Los registra el Contador (o Finanzas); las cotizaciones leen la
// tarifa vigente con taxRatesOn.

interface Dated {
  readonly row: FinTaxParameter;
  readonly validFrom: string;
  readonly validTo: string | null;
}

function dated(row: FinTaxParameter): Dated {
  return {
    row,
    validFrom: toCalendarDate(row.validFrom),
    validTo: row.validTo === null ? null : toCalendarDate(row.validTo),
  };
}

/** Vigencias de cada clave, de la más reciente a la más antigua. */
async function versionsByKey(tx: TenantTransaction, key?: string): Promise<Map<string, Dated[]>> {
  const rows = await tx.finTaxParameter.findMany({
    where: { ...(key === undefined ? {} : { key }), deletedAt: null },
    orderBy: [{ key: 'asc' }, { validFrom: 'desc' }],
  });
  const byKey = new Map<string, Dated[]>();
  for (const row of rows) byKey.set(row.key, [...(byKey.get(row.key) ?? []), dated(row)]);
  return byKey;
}

/** La tarifa como texto con dos decimales: «19.00». */
function rateText(row: FinTaxParameter): string {
  return row.rate.toFixed(2);
}

async function viewOf(tx: TenantTransaction, versions: readonly Dated[]) {
  const ids = versions.flatMap(({ row }) => (row.createdBy === null ? [] : [row.createdBy]));
  const people = await peopleById(tx, ids);
  return (version: Dated): TaxParameterVersion => {
    const person = version.row.createdBy === null ? undefined : people.get(version.row.createdBy);
    return {
      id: version.row.id,
      rate: rateText(version.row),
      valid_from: version.validFrom,
      valid_to: version.validTo,
      legal_basis: version.row.legalBasis,
      created_at: version.row.createdAt.toISOString(),
      created_by:
        person === undefined ? null : { id: person.id, name: person.displayName ?? person.email },
    };
  };
}

/** Tarifa vigente de un impuesto en una fecha: su nombre y la tarifa con dos decimales. */
export interface TaxRate {
  readonly key: string;
  readonly label: string;
  readonly rate: string;
}

/** Los impuestos con tarifa vigente en la fecha, por clave. Los demás módulos usan este. */
export async function taxRatesOn(
  tx: TenantTransaction,
  date: string,
): Promise<Map<string, TaxRate>> {
  const rates = new Map<string, TaxRate>();
  for (const [key, versions] of await versionsByKey(tx)) {
    const { current } = currentAndScheduled(versions, date);
    if (current !== null) {
      rates.set(key, { key, label: current.row.label, rate: rateText(current.row) });
    }
  }
  return rates;
}

/** Nombre de cada impuesto, aunque hoy no tenga tarifa vigente. */
export async function taxLabels(tx: TenantTransaction): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  for (const [key, versions] of await versionsByKey(tx)) {
    const latest = versions[0];
    if (latest !== undefined) labels.set(key, latest.row.label);
  }
  return labels;
}

@Injectable()
export class TaxParametersUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal): Promise<TaxParameterSummary[]> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const summaries: TaxParameterSummary[] = [];
      for (const [key, versions] of await versionsByKey(tx)) {
        const view = await viewOf(tx, versions);
        const { current, scheduled } = currentAndScheduled(versions, today);
        summaries.push({
          key,
          label: versions[0]?.row.label ?? key,
          current: current === null ? null : view(current),
          scheduled: scheduled === null ? null : view(scheduled),
        });
      }
      return summaries;
    });
  }

  async history(principal: Principal, key: string): Promise<TaxParameterHistoryResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const versions = (await versionsByKey(tx, key)).get(key);
      if (versions === undefined) throw taxParameterUnknown();
      const view = await viewOf(tx, versions);
      return { key, label: versions[0]?.row.label ?? key, data: versions.map(view) };
    });
  }

  /** Vigencia nueva de un impuesto; si la clave es nueva, exige su nombre. */
  async createVersion(
    principal: Principal,
    input: CreateTaxParameterVersionRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const at = this.clock.now();
    await this.database.withTenant(principal, async (tx) => {
      const [latest] = (await versionsByKey(tx, input.key)).get(input.key) ?? [];
      const label = input.label ?? latest?.row.label;
      if (label === undefined) throw taxLabelRequired();
      const problem = validFromProblem(
        input.valid_from,
        bogotaToday(at),
        latest?.validFrom ?? null,
      );
      if (problem !== null) throw taxValidFromInvalid(problem);
      const previousTo = await closePrevious(tx, latest, input.valid_from);
      const created = await tx.finTaxParameter.create({
        data: {
          tenantId: principal.tenantId,
          key: input.key,
          label,
          rate: input.rate,
          validFrom: fromCalendarDate(input.valid_from),
          legalBasis: input.legal_basis,
        },
      });
      const change = { created, previous: latest?.row ?? null, previousTo };
      await recordTaxChange(tx, { principal, meta, at }, change);
    });
  }
}

/** Cierra la vigencia anterior el día antes de la nueva; la anterior queda intacta. */
async function closePrevious(
  tx: TenantTransaction,
  latest: Dated | undefined,
  validFrom: string,
): Promise<string | null> {
  if (latest === undefined) return null;
  const previousTo = previousValidTo(validFrom);
  await tx.finTaxParameter.update({
    where: { id: latest.row.id },
    data: { validTo: fromCalendarDate(previousTo) },
  });
  return previousTo;
}

/** Auditoría con la tarifa anterior y la nueva, y el evento de la bandeja de salida. */
async function recordTaxChange(
  tx: TenantTransaction,
  actor: { readonly principal: Principal; readonly meta: RequestMeta; readonly at: Date },
  change: {
    readonly created: FinTaxParameter;
    readonly previous: FinTaxParameter | null;
    readonly previousTo: string | null;
  },
): Promise<void> {
  const { principal, meta, at } = actor;
  const { created, previous } = change;
  const validFrom = toCalendarDate(created.validFrom);
  await recordAuditEvent(tx, {
    tenantId: principal.tenantId,
    occurredAt: at,
    actor: { kind: 'user', id: principal.userId },
    action: 'finance.tax_parameter.update',
    entityType: 'fin_tax_parameter',
    entityId: created.id,
    result: 'success',
    changes: {
      key: created.key,
      label: created.label,
      rate: { from: previous === null ? null : rateText(previous), to: rateText(created) },
      valid_from: validFrom,
      previous_valid_to: change.previousTo,
      legal_basis: created.legalBasis,
    },
    meta,
  });
  await addOutboxEvent(tx, {
    tenantId: principal.tenantId,
    eventType: 'fin.tax.parameter.changed',
    actorId: principal.userId,
    occurredAt: at,
    payload: { id: created.id, key: created.key, valid_from: validFrom },
  });
}
