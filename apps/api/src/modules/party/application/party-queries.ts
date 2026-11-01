import { Inject, Injectable } from '@nestjs/common';
import {
  partyRoleSchema,
  type PartyConsent,
  type PartyDetail,
  type PartyListQuery,
  type PartyListResponse,
  type PartySearchQuery,
  type PartySearchResponse,
} from '@arza/contracts';

import type { Party, PartyRole, Prisma } from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, toCalendarDate } from '../../core/index.js';
import { consentsOfParty } from '../../privacy/index.js';
import { duplicateReasons, normalizeName, normalizePhone } from '../domain/duplicates.js';
import { dueDiligenceState } from '../domain/reviews.js';
import {
  findParty,
  partyName,
  partySummaryView,
  scopeOf,
  visibleParties,
  type PartyScope,
} from './party-support.js';

/** El historial de papeles, del más antiguo al más reciente; los del mismo día, en orden de registro. */
const WITH_ROLES = {
  roles: {
    where: { deletedAt: null },
    orderBy: [{ since: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.PartyInclude;
/** Terceros que se comparan uno a uno después del primer filtro en la base de datos. */
const SEARCH_CANDIDATES = 50;

function textFilter(q: string): Prisma.PartyWhereInput {
  const contains = { contains: q, mode: 'insensitive' } as const;
  return {
    OR: [
      { legalName: contains },
      { tradeName: contains },
      { firstName: contains },
      { lastName: contains },
      { idNumber: { startsWith: q.toUpperCase() } },
      { email: contains },
    ],
  };
}

/** Primer filtro de posibles duplicados; la comparación fina la hace el dominio. */
function candidateFilter(probe: PartySearchQuery): Prisma.PartyWhereInput[] {
  const filters: Prisma.PartyWhereInput[] = [];
  if (probe.id_number !== undefined) filters.push({ idNumber: probe.id_number });
  if (probe.email !== undefined) {
    filters.push({ email: { equals: probe.email.trim(), mode: 'insensitive' } });
  }
  const phone = probe.phone === undefined ? '' : normalizePhone(probe.phone);
  if (phone.length >= 7) filters.push({ phone: { endsWith: phone } });
  const word = (probe.name === undefined ? '' : normalizeName(probe.name))
    .split(' ')
    .reduce((longest, current) => (current.length > longest.length ? current : longest), '');
  if (word.length >= 3) {
    const contains = { contains: word, mode: 'insensitive' } as const;
    filters.push({
      OR: [{ legalName: contains }, { firstName: contains }, { lastName: contains }],
    });
  }
  return filters;
}

function detailOf(
  party: Party & { roles: PartyRole[] },
  today: string,
  latest: LatestRow,
  authorizations: PartyConsent[],
) {
  const state = dueDiligenceState(latest, today);
  const view: PartyDetail = {
    ...partySummaryView(party, party.roles),
    has_logo: party.logoFileId !== null,
    first_name: party.firstName,
    last_name: party.lastName,
    legal_name: party.legalName,
    trade_name: party.tradeName,
    address: party.address,
    status_reason: party.statusReason,
    authorizations,
    role_history: party.roles.map((row) => ({
      role: partyRoleSchema.parse(row.role),
      since: toCalendarDate(row.since),
      is_active: row.status === 'active',
    })),
    due_diligence: {
      state,
      next_review_on: state === 'none' ? null : (latest?.nextReviewOn ?? null),
    },
    created_at: party.createdAt.toISOString(),
  };
  return view;
}

type LatestRow = { readonly status: string; readonly nextReviewOn: string | null } | null;

async function latestReview(tx: TenantTransaction, partyId: string): Promise<LatestRow> {
  const row = await tx.dueDiligence.findFirst({
    where: { partyId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (row === null) return null;
  const nextReviewOn = row.nextReviewOn === null ? null : toCalendarDate(row.nextReviewOn);
  return { status: row.status, nextReviewOn };
}

/** Listado, búsqueda de posibles duplicados y ficha del tercero (ficha 17.3). */
@Injectable()
export class PartyQueries {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(
    principal: Principal,
    ability: AppAbility,
    query: PartyListQuery,
  ): Promise<PartyListResponse> {
    const where: Prisma.PartyWhereInput = {
      AND: [
        visibleParties(scopeOf(principal, ability)),
        query.q === undefined ? {} : textFilter(query.q),
        query.status === undefined ? {} : { status: query.status },
        query.role === undefined
          ? {}
          : { roles: { some: { role: query.role, status: 'active', deletedAt: null } } },
        query.cursor === undefined ? {} : { id: { lt: query.cursor } },
      ],
    };
    const rows = await this.database.withTenant(principal, (tx) =>
      tx.party.findMany({
        where,
        include: WITH_ROLES,
        orderBy: { id: 'desc' },
        take: query.limit + 1,
      }),
    );
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      data: page.map((row) => partySummaryView(row, row.roles)),
      next_cursor: rows.length > query.limit && last !== undefined ? last.id : null,
    };
  }

  async search(
    principal: Principal,
    ability: AppAbility,
    probe: PartySearchQuery,
  ): Promise<PartySearchResponse> {
    const filters = candidateFilter(probe);
    if (filters.length === 0) return { data: [] };
    const scope = scopeOf(principal, ability);
    return this.database.withTenant(principal, async (tx) => {
      const survivors = await this.survivorsOfMerged(tx, scope, probe);
      const rows = await tx.party.findMany({
        where: {
          AND: [visibleParties(scope), { OR: [...filters, { id: { in: [...survivors] } }] }],
          ...(probe.exclude_id === undefined ? {} : { NOT: { id: probe.exclude_id } }),
        },
        include: WITH_ROLES,
        take: SEARCH_CANDIDATES,
      });
      const data = rows.flatMap((row) => {
        const fingerprint = { ...row, name: partyName(row) };
        const probeFields = {
          idNumber: probe.id_number,
          name: probe.name,
          email: probe.email,
          phone: probe.phone,
        };
        const reasons = duplicateReasons(probeFields, fingerprint);
        if (survivors.has(row.id) && !reasons.includes('id_number')) reasons.unshift('id_number');
        return reasons.length === 0 ? [] : [{ party: partySummaryView(row, row.roles), reasons }];
      });
      return { data };
    });
  }

  /**
   * Un documento que ya pertenece a un duplicado fusionado lleva al tercero que se conservó:
   * así «crear con documento repetido» ofrece abrir el registro vigente.
   */
  private async survivorsOfMerged(
    tx: TenantTransaction,
    scope: PartyScope,
    probe: PartySearchQuery,
  ): Promise<Set<string>> {
    if (probe.id_number === undefined) return new Set();
    const merged = await tx.party.findMany({
      where: { idNumber: probe.id_number, mergedIntoId: { not: null } },
      select: { mergedIntoId: true },
    });
    const ids = merged.flatMap((row) => row.mergedIntoId ?? []);
    const visible = await tx.party.findMany({
      where: { id: { in: ids }, ...visibleParties(scope) },
      select: { id: true },
    });
    return new Set(visible.map((row) => row.id));
  }

  async detail(principal: Principal, ability: AppAbility, id: string): Promise<PartyDetail> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const party = await findParty(tx, scopeOf(principal, ability), id);
      const roles = await tx.partyRole.findMany({
        where: { partyId: id, deletedAt: null },
        orderBy: WITH_ROLES.roles.orderBy,
      });
      // Las autorizaciones de los duplicados fusionados siguen al tercero que se conservó.
      const merged = await tx.party.findMany({ where: { mergedIntoId: id }, select: { id: true } });
      const authorizations = await consentsOfParty(tx, [id, ...merged.map((row) => row.id)]);
      return detailOf({ ...party, roles }, today, await latestReview(tx, id), authorizations);
    });
  }
}
