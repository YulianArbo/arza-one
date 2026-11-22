import {
  REVIEW_INPUT_KEYS,
  REVIEW_INPUTS,
  reviewInputKeySchema,
  type ManagementReview,
  type ManagementReviewSummary,
  type ReviewInput,
} from '@arza/contracts';
import { z } from 'zod';

import type { QmsManagementReview as ReviewRow } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { toCalendarDate } from '../../core/index.js';
import { dateOf, optionalRef, refOf, userRefs } from './qms-support.js';

// Cómo se guarda y se muestra el acta de revisión por la dirección (B39; RE-SGC-007). Las entradas y
// las decisiones van en JSON dentro del acta: así el acta aprobada conserva exactamente lo que se
// revisó, aunque las cifras de la plataforma cambien después.

const storedInputSchema = z.object({
  key: reviewInputKeySchema,
  lines: z.array(z.string()),
  comment: z.string().nullable(),
});
export type StoredInput = z.infer<typeof storedInputSchema>;

const storedDecisionSchema = z.object({
  description: z.string(),
  responsible_id: z.uuid(),
  due_on: z.iso.date(),
  action: z.object({ id: z.uuid(), code: z.string() }).nullable(),
});
export type StoredDecision = z.infer<typeof storedDecisionSchema>;

/** Las diez entradas vacías con que nace un acta. */
export function emptyInputs(): StoredInput[] {
  return REVIEW_INPUT_KEYS.map((key) => ({ key, lines: [], comment: null }));
}

export function storedInputs(row: Pick<ReviewRow, 'inputs'>): StoredInput[] {
  const stored = z.array(storedInputSchema).parse(row.inputs);
  return REVIEW_INPUT_KEYS.map(
    (key) => stored.find((input) => input.key === key) ?? { key, lines: [], comment: null },
  );
}

export function storedDecisions(row: Pick<ReviewRow, 'decisions'>): StoredDecision[] {
  return z.array(storedDecisionSchema).parse(row.decisions);
}

export function reviewSummaryView(row: ReviewRow): ManagementReviewSummary {
  return {
    id: row.id,
    code: row.code,
    period_from: toCalendarDate(row.periodFrom),
    period_to: toCalendarDate(row.periodTo),
    meeting_on: toCalendarDate(row.meetingOn),
    status: row.status as ManagementReviewSummary['status'],
    version: row.version,
  };
}

function inputView(input: StoredInput): ReviewInput {
  return { ...input, title: REVIEW_INPUTS[input.key].title };
}

export async function reviewView(tx: TenantTransaction, row: ReviewRow): Promise<ManagementReview> {
  const decisions = storedDecisions(row);
  const people = await userRefs(tx, [
    row.approvedBy,
    ...decisions.map((decision) => decision.responsible_id),
  ]);
  return {
    ...reviewSummaryView(row),
    attendees: row.attendees,
    inputs: storedInputs(row).map(inputView),
    inputs_loaded_at: row.inputsLoadedAt?.toISOString() ?? null,
    conclusions: row.conclusions,
    decisions: decisions.map((decision) => ({
      description: decision.description,
      responsible: refOf(people, decision.responsible_id),
      due_on: decision.due_on,
      action: decision.action,
    })),
    return_reason: row.returnReason,
    approved_by: optionalRef(people, row.approvedBy, 'Persona'),
    approved_on: dateOf(row.approvedOn),
    document_id: row.fileId,
  };
}
