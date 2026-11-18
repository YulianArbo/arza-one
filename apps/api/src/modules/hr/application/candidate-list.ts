import { Inject, Injectable } from '@nestjs/common';
import {
  candidateSchema,
  type Candidate,
  type CandidateListQuery,
  type Notice,
} from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { positionsById, toCalendarDate } from '../../core/index.js';
import { peopleById } from '../../iam/index.js';
import { candidateParties } from '../../party/index.js';
import { publishedNotices } from '../../privacy/index.js';

const CANDIDATE_INCLUDE = {
  vacancy: { select: { id: true, code: true, positionId: true } },
  employees: {
    where: { deletedAt: null, status: { not: 'cancelled' } },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { id: true },
  },
  evaluations: {
    where: { deletedAt: null },
    orderBy: [{ evaluatedOn: 'desc' }, { id: 'asc' }],
  },
} as const satisfies Prisma.HrCandidateInclude;

type CandidateRow = Prisma.HrCandidateGetPayload<{ include: typeof CANDIDATE_INCLUDE }>;
type Parties = Awaited<ReturnType<typeof candidateParties>>;
type Positions = Awaited<ReturnType<typeof positionsById>>;
type People = Awaited<ReturnType<typeof peopleById>>;

function personName(person: {
  readonly firstName: string | null;
  readonly lastName: string | null;
}): string {
  return `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim();
}

function evaluatorOf(id: string | null, evaluators: People): { id: string; name: string } | null {
  if (id === null || !evaluators.has(id)) return null;
  return { id, name: evaluators.get(id)?.displayName ?? 'Evaluador' };
}

function evaluationsOf(row: CandidateRow, evaluators: People) {
  if (row.erasedAt !== null) return [];
  return row.evaluations.map((evaluation) => ({
    id: evaluation.id,
    kind: evaluation.kind,
    evaluated_on: toCalendarDate(evaluation.evaluatedOn),
    score: evaluation.score,
    note: evaluation.note,
    evaluator: evaluatorOf(evaluation.evaluatorId, evaluators),
  }));
}

function candidateView(
  row: CandidateRow,
  people: Parties,
  positions: Positions,
  evaluators: People,
): Candidate {
  const person = row.erasedAt === null ? people.get(row.partyId) : undefined;
  return candidateSchema.parse({
    id: row.id,
    name: person === undefined ? 'Datos no disponibles' : personName(person),
    vacancy: {
      id: row.vacancy.id,
      code: row.vacancy.code,
      position: positions.get(row.vacancy.positionId)?.name ?? 'Cargo no disponible',
    },
    source: row.source,
    stage: row.stage,
    applied_on: toCalendarDate(row.appliedOn),
    email: person?.email ?? null,
    phone: person?.phone ?? null,
    id_type: person?.idType ?? null,
    id_number: person?.idNumber ?? null,
    resume_file_id: row.erasedAt === null ? row.resumeFileId : null,
    talent_bank: row.talentBank,
    discarded_on: row.discardedOn === null ? null : toCalendarDate(row.discardedOn),
    discard_reason: row.erasedAt === null ? row.discardReason : null,
    retention_until: row.retentionUntil === null ? null : toCalendarDate(row.retentionUntil),
    erased_at: row.erasedAt?.toISOString() ?? null,
    evaluations: evaluationsOf(row, evaluators),
    employee_id: row.employees[0]?.id ?? null,
    version: row.version,
  });
}

/** Candidaturas con su persona, cargo y evaluaciones resueltos por lote. */
async function loadCandidateViews(
  tx: TenantTransaction,
  tenantId: string,
  query: CandidateListQuery,
): Promise<Candidate[]> {
  const rows = await tx.hrCandidate.findMany({
    where: {
      tenantId,
      deletedAt: null,
      ...(query.vacancy_id === undefined ? {} : { vacancyId: query.vacancy_id }),
    },
    orderBy: [{ appliedOn: 'desc' }, { id: 'asc' }],
    include: CANDIDATE_INCLUDE,
  });
  const visible = rows.filter(({ erasedAt }) => erasedAt === null);
  const people = await candidateParties(
    tx,
    visible.map(({ partyId }) => partyId),
  );
  const positions = await positionsById(
    tx,
    rows.map(({ vacancy }) => vacancy.positionId),
  );
  const evaluators = await peopleById(
    tx,
    visible.flatMap(({ evaluations }) =>
      evaluations.flatMap(({ evaluatorId }) => (evaluatorId === null ? [] : [evaluatorId])),
    ),
  );
  return rows.map((row) => candidateView(row, people, positions, evaluators));
}

@Injectable()
export class CandidateList {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async authorizationNotices(principal: Principal): Promise<Notice[]> {
    return this.database.withTenant(principal, (tx) =>
      publishedNotices(tx, ['authorization_candidate']),
    );
  }

  async list(principal: Principal, query: CandidateListQuery): Promise<Candidate[]> {
    return this.database.withTenant(principal, (tx) =>
      loadCandidateViews(tx, principal.tenantId, query),
    );
  }
}
