import {
  dataCategorySchema,
  privacyIncidentStatusSchema,
  SENSITIVE_DATA_CATEGORIES,
  type PrivacyIncident as PrivacyIncidentView,
  type PrivacyIncidentSummary,
} from '@arza/contracts';

import type { PrivacyIncident, PrivacyIncidentMeasure } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, toCalendarDate } from '../../core/index.js';
import { peopleById } from '../../iam/index.js';

// Cómo se ven los incidentes con datos personales en la API (B42).

const dateOf = (value: Date | null): string | null =>
  value === null ? null : toCalendarDate(value);

export function incidentSummary(row: PrivacyIncident, now: Date): PrivacyIncidentSummary {
  const categories = row.dataCategories.map((item) => dataCategorySchema.parse(item));
  const status = privacyIncidentStatusSchema.parse(row.status);
  const sicDueOn = toCalendarDate(row.sicDueOn);
  const pending = row.reportedOn === null && row.notReportableReason === null;
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    status,
    detected_at: row.detectedAt.toISOString(),
    affected_count: row.affectedCount,
    sensitive: categories.some((item) => SENSITIVE_DATA_CATEGORIES.includes(item)),
    sic_due_on: sicDueOn,
    reported_on: dateOf(row.reportedOn),
    overdue: status !== 'closed' && pending && sicDueOn < bogotaToday(now),
    version: row.version,
  };
}

export async function incidentDetail(
  tx: TenantTransaction,
  row: PrivacyIncident & { measures: PrivacyIncidentMeasure[] },
  now: Date,
): Promise<PrivacyIncidentView> {
  const people = await peopleById(
    tx,
    row.measures.flatMap((measure) => (measure.createdBy === null ? [] : [measure.createdBy])),
  );
  return {
    ...incidentSummary(row, now),
    description: row.description,
    data_categories: row.dataCategories.map((item) => dataCategorySchema.parse(item)),
    project_incident_ref: row.projectIncidentRef,
    contained_at: row.containedAt?.toISOString() ?? null,
    containment_note: row.containmentNote,
    sic_reference: row.sicReference,
    holders_notified_on: dateOf(row.holdersNotifiedOn),
    holders_notice: row.holdersNotice,
    not_reportable_reason: row.notReportableReason,
    closed_at: row.closedAt?.toISOString() ?? null,
    measures: row.measures.map((measure) => ({
      id: measure.id,
      description: measure.description,
      taken_on: toCalendarDate(measure.takenOn),
      recorded_by:
        measure.createdBy === null ? null : (people.get(measure.createdBy)?.displayName ?? null),
    })),
  };
}
