import { Inject, Injectable } from '@nestjs/common';
import {
  timeEntryStatusSchema,
  type TimeEntry,
  type TimeListQuery,
  type TimeListResponse,
  type TimeOptions,
} from '@arza/contracts';
import { Decimal } from 'decimal.js';

import type {
  Prisma,
  PrjItem,
  PrjProject,
  PrjTimeEntry,
} from '../../../generated/prisma/client.js';
import { hasPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { earliestWorkDate } from '../domain/control-rules.js';
import { canOnProject, findVisibleProject } from './project-records.js';
import { peopleNames, personRef } from './project-support.js';

// Consultas de horas (B27): las de un proyecto (quien aprueba ve todas; el equipo, las suyas) y
// «Mis horas», con los proyectos e ítems donde la persona puede registrar.

type EntryRow = PrjTimeEntry & {
  readonly project: Pick<PrjProject, 'id' | 'code' | 'name'>;
  readonly item: Pick<PrjItem, 'id' | 'number' | 'title'> | null;
};

const ENTRY_INCLUDE = {
  project: { select: { id: true, code: true, name: true } },
  item: { select: { id: true, number: true, title: true } },
} as const;

function entryView(entry: EntryRow, names: ReadonlyMap<string, string>): TimeEntry {
  return {
    id: entry.id,
    project: entry.project,
    item: entry.item,
    person: personRef(names, entry.userId) ?? { id: entry.userId, name: 'Colaborador' },
    work_date: toCalendarDate(entry.workDate),
    hours: entry.hours.toNumber(),
    billable: entry.billable,
    note: entry.note,
    status: timeEntryStatusSchema.parse(entry.status),
    decision_note: entry.decisionNote,
    decided_by: personRef(names, entry.decidedBy),
    version: entry.version,
  };
}

function rangeOf(query: TimeListQuery): Prisma.PrjTimeEntryWhereInput {
  const workDate: Prisma.DateTimeFilter = {};
  if (query.from !== undefined) workDate.gte = fromCalendarDate(query.from);
  if (query.to !== undefined) workDate.lte = fromCalendarDate(query.to);
  return {
    ...(query.from === undefined && query.to === undefined ? {} : { workDate }),
    ...(query.status === undefined ? {} : { status: query.status }),
  };
}

async function listed(
  tx: TenantTransaction,
  where: Prisma.PrjTimeEntryWhereInput,
): Promise<TimeListResponse> {
  const rows = await tx.prjTimeEntry.findMany({
    where: { ...where, deletedAt: null },
    include: ENTRY_INCLUDE,
    orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    take: 500,
  });
  const names = await peopleNames(
    tx,
    rows.flatMap((row) => [row.userId, row.decidedBy]),
  );
  const total = rows.reduce((sum, row) => sum.plus(row.hours), new Decimal(0));
  return { data: rows.map((row) => entryView(row, names)), total_hours: total.toNumber() };
}

@Injectable()
export class TimeQueries {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Las horas del proyecto: todas para quien aprueba; las propias para los demás. */
  async ofProject(
    principal: Principal,
    ability: AppAbility,
    projectId: string,
    query: TimeListQuery,
  ): Promise<TimeListResponse> {
    return this.database.withTenant(principal, async (tx) => {
      await findVisibleProject(tx, ability, projectId);
      const seesAll = hasPermission(ability, 'project.time.approve');
      return listed(tx, {
        projectId,
        ...(seesAll ? {} : { userId: principal.userId }),
        ...rangeOf(query),
      });
    });
  }

  /** «Mis horas»: las de la persona en todos sus proyectos. */
  async mine(principal: Principal, query: TimeListQuery): Promise<TimeListResponse> {
    return this.database.withTenant(principal, (tx) =>
      listed(tx, { userId: principal.userId, ...rangeOf(query) }),
    );
  }

  /** Proyectos abiertos donde la persona es del equipo y puede registrar, con sus ítems abiertos. */
  async options(principal: Principal, ability: AppAbility): Promise<TimeOptions> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const projects = await tx.prjProject.findMany({
        where: {
          deletedAt: null,
          status: { not: 'closed' },
          members: { some: { userId: principal.userId, deletedAt: null } },
        },
        include: {
          members: { where: { deletedAt: null }, select: { userId: true } },
          items: {
            where: { deletedAt: null, status: { not: 'done' }, type: { not: 'epic' } },
            select: { id: true, number: true, title: true },
            orderBy: { number: 'asc' },
          },
        },
        orderBy: { code: 'asc' },
      });
      const allowed = projects.filter((project) =>
        canOnProject(
          ability,
          'project.time.log',
          project.members.map((member) => member.userId),
        ),
      );
      return {
        projects: allowed.map((project) => ({
          id: project.id,
          code: project.code,
          name: project.name,
          items: project.items,
        })),
        earliest_date: earliestWorkDate(today),
        today,
      };
    });
  }
}
