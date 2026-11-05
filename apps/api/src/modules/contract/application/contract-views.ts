import {
  amendmentKindSchema,
  amendmentStatusSchema,
  clauseOrdinal,
  clauseOriginSchema,
  contractKindSchema,
  contractRenewalSchema,
  fillClause,
  obligationStatusSchema,
  type Amendment,
  type ContractClause,
  type ContractDetail,
  type ContractSummary,
  type Obligation,
} from '@arza/contracts';
import { z } from 'zod';

import type {
  CtrAmendment,
  CtrContract,
  CtrContractClause,
  CtrObligation,
  Prisma,
} from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { toCalendarDate } from '../../core/index.js';
import { acceptedQuote } from '../../crm/index.js';
import { attachedFiles } from '../../doc/index.js';
import { commercialParties } from '../../party/index.js';
import { statusOf } from './contract-records.js';
import { peopleNames, personRef } from './contract-support.js';

// Cómo se muestra un contrato (B24): su fila en la lista y su ficha completa, que es el expediente
// contractual (el texto cláusula por cláusula, las obligaciones, los otrosíes y los PDF).

const storedValuesSchema = z.record(z.string(), z.string());

type Names = ReadonlyMap<string, string>;

function money(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toFixed(2);
}

function dateOrNull(value: Date | null): string | null {
  return value === null ? null : toCalendarDate(value);
}

export function summaryView(
  contract: CtrContract,
  parties: ReadonlyMap<string, { name: string }>,
  names: Names,
): ContractSummary {
  return {
    id: contract.id,
    code: contract.code,
    kind: contractKindSchema.parse(contract.kind),
    title: contract.title,
    party: { id: contract.partyId, name: parties.get(contract.partyId)?.name ?? 'Cliente' },
    status: statusOf(contract),
    value: money(contract.value),
    starts_on: toCalendarDate(contract.startsOn),
    ends_on: toCalendarDate(contract.endsOn),
    responsible: personRef(names, contract.responsibleId),
    has_modified_clauses: contract.hasModifiedClauses,
    created_at: contract.createdAt.toISOString(),
    version: contract.version,
  };
}

/** El texto de la biblioteca de cada cláusula usada, por clave y versión. */
async function libraryTexts(
  tx: TenantTransaction,
  clauses: readonly CtrContractClause[],
): Promise<Map<string, string>> {
  const used = clauses.flatMap((clause) =>
    clause.clauseKey === null || clause.clauseVersion === null
      ? []
      : [{ key: clause.clauseKey, clauseVersion: clause.clauseVersion }],
  );
  if (used.length === 0) return new Map();
  const rows = await tx.ctrClause.findMany({ where: { OR: used } });
  return new Map(rows.map((row) => [`${row.key}@${String(row.clauseVersion)}`, row.body]));
}

function clauseViews(
  clauses: readonly CtrContractClause[],
  library: ReadonlyMap<string, string>,
  values: Readonly<Record<string, string>>,
): ContractClause[] {
  let numbered = 0;
  return clauses.map((clause) => {
    if (clause.numbered) numbered += 1;
    const model = library.get(`${clause.clauseKey ?? ''}@${String(clause.clauseVersion)}`);
    const origin = clauseOriginSchema.parse(clause.origin);
    return {
      id: clause.id,
      position: clause.position,
      ordinal: clause.numbered ? clauseOrdinal(numbered) : null,
      clause_key: clause.clauseKey,
      clause_version: clause.clauseVersion,
      title: clause.title,
      body: clause.body,
      origin,
      library_text: origin === 'modified' && model !== undefined ? fillClause(model, values) : null,
      required: clause.required,
    };
  });
}

function obligationView(row: CtrObligation, names: Names): Obligation {
  return {
    id: row.id,
    description: row.description,
    responsible: personRef(names, row.responsibleId),
    due_on: toCalendarDate(row.dueOn),
    status: obligationStatusSchema.parse(row.status),
    done_at: row.doneAt?.toISOString() ?? null,
    done_note: row.doneNote,
    version: row.version,
  };
}

function amendmentView(row: CtrAmendment, names: Names): Amendment {
  return {
    id: row.id,
    code: row.code,
    kind: amendmentKindSchema.parse(row.kind),
    status: amendmentStatusSchema.parse(row.status),
    summary: row.summary,
    body: row.body,
    effective_on: toCalendarDate(row.effectiveOn),
    new_ends_on: dateOrNull(row.newEndsOn),
    new_value: money(row.newValue),
    author: personRef(names, row.createdBy),
    decided_by: personRef(names, row.decidedBy),
    decision_note: row.decisionNote,
    pdf_ready: row.pdfStatus === 'ready',
    signed_on: dateOrNull(row.signedOn),
    created_at: row.createdAt.toISOString(),
    version: row.version,
  };
}

interface DetailParts {
  readonly clauses: CtrContractClause[];
  readonly obligations: CtrObligation[];
  readonly amendments: CtrAmendment[];
}

async function detailParts(tx: TenantTransaction, contractId: string): Promise<DetailParts> {
  const where = { contractId, deletedAt: null };
  const [clauses, obligations, amendments] = await Promise.all([
    tx.ctrContractClause.findMany({ where, orderBy: { position: 'asc' } }),
    tx.ctrObligation.findMany({ where, orderBy: [{ dueOn: 'asc' }, { id: 'asc' }] }),
    tx.ctrAmendment.findMany({ where, orderBy: { sequence: 'asc' } }),
  ]);
  return { clauses, obligations, amendments };
}

function peopleOf(contract: CtrContract, parts: DetailParts): (string | null)[] {
  return [
    contract.responsibleId,
    contract.createdBy,
    contract.decidedBy,
    contract.signedBy,
    contract.terminatedBy,
    ...parts.obligations.map((row) => row.responsibleId),
    ...parts.amendments.flatMap((row) => [row.createdBy, row.decidedBy]),
  ];
}

type FileNames = ReadonlyMap<string, { readonly id: string; readonly file_name: string }>;

function pdfView(contract: CtrContract, files: FileNames): ContractDetail['pdf'] {
  const status =
    contract.pdfStatus === 'ready' || contract.pdfStatus === 'pending'
      ? contract.pdfStatus
      : 'none';
  const file = contract.pdfFileId === null ? undefined : files.get(contract.pdfFileId);
  return { status, file_name: file?.file_name ?? null, sha256: contract.pdfSha256 };
}

function signedView(
  contract: CtrContract,
  files: FileNames,
  names: Names,
): ContractDetail['signed'] {
  const file = contract.signedFileId === null ? undefined : files.get(contract.signedFileId);
  if (file === undefined || contract.signedOn === null) return null;
  return {
    file: { id: file.id, file_name: file.file_name },
    signed_on: toCalendarDate(contract.signedOn),
    by: personRef(names, contract.signedBy),
  };
}

function terminationView(contract: CtrContract, names: Names): ContractDetail['termination'] {
  if (contract.terminatedOn === null || contract.terminationReason === null) return null;
  return {
    terminated_on: toCalendarDate(contract.terminatedOn),
    reason: contract.terminationReason,
    by: personRef(names, contract.terminatedBy),
  };
}

function approvalView(contract: CtrContract, names: Names): ContractDetail['approval'] {
  return {
    submitted_at: contract.submittedAt?.toISOString() ?? null,
    decided_by: personRef(names, contract.decidedBy),
    decided_at: contract.decidedAt?.toISOString() ?? null,
    note: contract.decisionNote,
    legal_note: contract.legalNote,
  };
}

/** La ficha completa del contrato. */
export async function detailView(
  tx: TenantTransaction,
  contract: CtrContract,
): Promise<ContractDetail> {
  const parts = await detailParts(tx, contract.id);
  const fileIds = [contract.pdfFileId, contract.signedFileId].filter(
    (id): id is string => id !== null,
  );
  const [parties, names, library, files, template, quote] = await Promise.all([
    commercialParties(tx, [contract.partyId]),
    peopleNames(tx, peopleOf(contract, parts)),
    libraryTexts(tx, parts.clauses),
    attachedFiles(tx, fileIds),
    tx.ctrTemplate.findFirstOrThrow({ where: { id: contract.templateId } }),
    contract.quoteId === null ? null : acceptedQuote(tx, contract.quoteId),
  ]);
  const values = storedValuesSchema.parse(contract.variableValues);
  return {
    ...summaryView(contract, parties, names),
    object: contract.object,
    payment_terms: contract.paymentTerms,
    renewal: contractRenewalSchema.parse(contract.renewal),
    client_signer_name: contract.clientSignerName,
    client_signer_document: contract.clientSignerDocument,
    template: { id: template.id, code: template.code, name: template.name },
    quote:
      quote === null
        ? null
        : { id: quote.id, code: quote.code, version_number: quote.versionNumber },
    author: personRef(names, contract.createdBy),
    clauses: clauseViews(parts.clauses, library, values),
    approval: approvalView(contract, names),
    pdf: pdfView(contract, files),
    signed: signedView(contract, files, names),
    termination: terminationView(contract, names),
    last_alert_days: contract.lastAlertDays,
    obligations: parts.obligations.map((row) => obligationView(row, names)),
    amendments: parts.amendments.map((row) => amendmentView(row, names)),
  };
}
