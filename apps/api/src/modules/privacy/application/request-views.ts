import {
  erasureResultSchema,
  identityMethodSchema,
  personalDataExportStatusSchema,
  privacyRequestChannelSchema,
  privacyRequestClosureSchema,
  privacyRequestEventKindSchema,
  privacyRequestKindSchema,
  privacyRequestStatusSchema,
  privacyRightSchema,
  type PrivacyRequest as PrivacyRequestView,
  type PrivacyRequestSummary,
} from '@arza/contracts';

import type {
  PrivacyDataExport,
  PrivacyRequest,
  PrivacyRequestEvent,
} from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, toCalendarDate } from '../../core/index.js';
import { peopleById } from '../../iam/index.js';
import type { PartyDirectory } from './party-directory.js';
import { partyNames } from './privacy-support.js';
import { requirementOpenUntil } from './request-steps.js';

// Cómo se ven las solicitudes de titulares en la API (B42).

const iso = (value: Date | null): string | null => value?.toISOString() ?? null;

export async function requestSummaries(
  tx: TenantTransaction,
  parties: PartyDirectory,
  rows: readonly PrivacyRequest[],
  now: Date,
): Promise<PrivacyRequestSummary[]> {
  const nameOf = await partyNames(
    tx,
    parties,
    rows.flatMap((row) => (row.partyId === null ? [] : [row.partyId])),
  );
  const today = bogotaToday(now);
  return rows.map((row) => {
    const dueOn = row.dueOn === null ? null : toCalendarDate(row.dueOn);
    const status = privacyRequestStatusSchema.parse(row.status);
    const open = status === 'received' || status === 'verifying' || status === 'in_progress';
    return {
      id: row.id,
      code: row.code,
      right: privacyRightSchema.parse(row.right),
      kind: privacyRequestKindSchema.parse(row.kind),
      channel: privacyRequestChannelSchema.parse(row.channel),
      status,
      requester_name: row.requesterName,
      party: row.partyId === null ? null : { id: row.partyId, name: nameOf(row.partyId) },
      received_at: row.receivedAt.toISOString(),
      due_on: dueOn,
      overdue: open && dueOn !== null && dueOn < today,
      extended: row.extendedAt !== null,
      paused: row.requirementSentAt !== null && row.requirementAnsweredAt === null,
      version: row.version,
    };
  });
}

function exportView(row: PrivacyDataExport) {
  return {
    id: row.id,
    status: personalDataExportStatusSchema.parse(row.status),
    requested_at: row.requestedAt.toISOString(),
    ready_at: iso(row.readyAt),
    pdf_file_id: row.pdfFileId,
  };
}

type RequestRow = PrivacyRequest & {
  events: PrivacyRequestEvent[];
  exports: PrivacyDataExport[];
};

type NameOf = (id: string | null) => string | null;

function verificationOf(row: PrivacyRequest, nameOf: NameOf): PrivacyRequestView['verification'] {
  if (row.verificationMethod === null || row.verifiedAt === null) return null;
  return {
    method: identityMethodSchema.parse(row.verificationMethod),
    note: row.verificationNote ?? '',
    verified_at: row.verifiedAt.toISOString(),
    verified_by: nameOf(row.verifiedBy),
  };
}

function requirementOf(row: PrivacyRequest): PrivacyRequestView['requirement'] {
  if (row.requirementText === null || row.requirementSentAt === null) return null;
  return {
    text: row.requirementText,
    sent_at: row.requirementSentAt.toISOString(),
    answered_at: iso(row.requirementAnsweredAt),
  };
}

function eventView(event: PrivacyRequestEvent, nameOf: NameOf) {
  return {
    kind: privacyRequestEventKindSchema.parse(event.kind),
    note: event.note,
    actor: nameOf(event.actorId),
    occurred_at: event.occurredAt.toISOString(),
    mailed_at: iso(event.mailedAt),
  };
}

async function namesOf(tx: TenantTransaction, row: RequestRow): Promise<NameOf> {
  const ids = row.events.flatMap((event) => (event.actorId === null ? [] : [event.actorId]));
  if (row.verifiedBy !== null) ids.push(row.verifiedBy);
  const people = await peopleById(tx, ids);
  return (id) => (id === null ? null : (people.get(id)?.displayName ?? null));
}

export async function requestDetail(
  tx: TenantTransaction,
  parties: PartyDirectory,
  row: RequestRow,
  now: Date,
): Promise<PrivacyRequestView> {
  const [summary] = await requestSummaries(tx, parties, [row], now);
  if (summary === undefined) throw new Error('La solicitud no tiene resumen.');
  const nameOf = await namesOf(tx, row);
  return {
    ...summary,
    requester_email: row.requesterEmail,
    requester_phone: row.requesterPhone,
    document_number: row.documentNumber,
    description: row.description,
    source_code: row.sourceCode,
    verification: verificationOf(row, nameOf),
    requirement: requirementOf(row),
    extension_reason: row.extensionReason,
    requirement_open_until: await requirementOpenUntil(tx, row),
    response: row.response,
    responded_at: iso(row.respondedAt),
    closure: row.closure === null ? null : privacyRequestClosureSchema.parse(row.closure),
    closed_at: iso(row.closedAt),
    exports: row.exports.map(exportView),
    erasure: row.erasure === null ? null : erasureResultSchema.parse(row.erasure),
    events: row.events.map((event) => eventView(event, nameOf)),
  };
}
