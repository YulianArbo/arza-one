import {
  analysisSchema,
  type Nonconformity,
  type NonconformitySummary,
  type QmsRef,
} from '@arza/contracts';

import type { QmsNonconformity } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { toCalendarDate } from '../../core/index.js';
import { dateOf, optionalRef, processRefs, refOf, userRefs } from './qms-support.js';

// Cómo se muestra una no conformidad: el resumen de las listas y el detalle con su análisis.

interface ViewRefs {
  readonly people: ReadonlyMap<string, QmsRef>;
  readonly processes: ReadonlyMap<string, QmsRef>;
}

export function summaryView(row: QmsNonconformity, refs: ViewRefs): NonconformitySummary {
  const origin =
    row.originId === null || row.originCode === null
      ? null
      : {
          type: row.source as NonconformitySummary['source'],
          id: row.originId,
          code: row.originCode,
        };
  return {
    id: row.id,
    code: row.code,
    source: row.source as NonconformitySummary['source'],
    origin,
    process: optionalRef(refs.processes, row.processId, 'Proceso'),
    description: row.description,
    classification: row.classification as NonconformitySummary['classification'],
    status: row.status as NonconformitySummary['status'],
    detected_on: toCalendarDate(row.detectedOn),
    reported_by: refOf(refs.people, row.reportedBy),
    version: row.version,
  };
}

export function detailView(row: QmsNonconformity, refs: ViewRefs): Nonconformity {
  return {
    ...summaryView(row, refs),
    containment: row.containment,
    contained_on: dateOf(row.containedOn),
    analysis: row.analysis === null ? null : analysisSchema.parse(row.analysis),
    root_cause: row.rootCause,
    close_note: row.closeNote,
    reopen_reason: row.reopenReason,
    closed_on: dateOf(row.closedOn),
  };
}

/** Los nombres de las personas y procesos de unas no conformidades. */
export async function nonconformityRefs(
  tx: TenantTransaction,
  rows: readonly QmsNonconformity[],
): Promise<ViewRefs> {
  const people = await userRefs(
    tx,
    rows.map((row) => row.reportedBy),
  );
  const processes = await processRefs(
    tx,
    rows.map((row) => row.processId),
  );
  return { people, processes };
}
