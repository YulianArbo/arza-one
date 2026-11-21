import { Inject, Injectable } from '@nestjs/common';
import type { MyInvestigationAction, MySst, PendingHomeInspection, SstRef } from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, toCalendarDate } from '../../core/index.js';
import { activeEmployeesForSst, employeeIdOfUser } from '../../hr/index.js';
import { activeCollaborators } from '../../iam/index.js';
import { committeesOf } from './committee-membership.js';
import { ownComplaints } from './complaints.js';
import { checklistOf, inspectionViews } from './inspection-views.js';
import { ppeViews } from './ppe.js';
import { ownReports } from './quick-reports.js';

// Lo de SST que cada persona ve en «Mi espacio» (B37) y las listas de personas para los
// formularios de SST.

async function pendingHome(
  tx: TenantTransaction,
  employeeId: string,
): Promise<PendingHomeInspection[]> {
  const rows = await tx.sstInspection.findMany({
    where: { kind: 'home', employeeId, status: 'requested', deletedAt: null },
    orderBy: [{ dueOn: 'asc' }, { id: 'asc' }],
  });
  if (rows.length === 0) return [];
  const checklist = await checklistOf(tx, 'home');
  return (await inspectionViews(tx, rows)).map((view) => ({ ...view, checklist }));
}

async function myActions(tx: TenantTransaction, userId: string): Promise<MyInvestigationAction[]> {
  const rows = await tx.sstInvestigationAction.findMany({
    where: { responsibleId: userId, doneOn: null, deletedAt: null },
    include: { investigation: { include: { incident: { select: { code: true } } } } },
    orderBy: [{ dueOn: 'asc' }, { id: 'asc' }],
    take: 50,
  });
  return rows.map((row) => ({
    id: row.id,
    incident_code: row.investigation.incident.code,
    description: row.description,
    due_on: toCalendarDate(row.dueOn),
    version: row.version,
  }));
}

@Injectable()
export class MySstQueries {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async summary(principal: Principal): Promise<MySst> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const own = await employeeIdOfUser(tx, principal.userId);
      const ppe =
        own === null
          ? []
          : await tx.sstPpeDelivery.findMany({
              where: { employeeId: own, deletedAt: null },
              orderBy: [{ deliveredOn: 'desc' }, { id: 'asc' }],
              take: 50,
            });
      return {
        is_employee: own !== null,
        reports: await ownReports(tx, principal.userId),
        complaints: await ownComplaints(tx, principal.userId),
        ppe: await ppeViews(tx, ppe),
        home_inspections: own === null ? [] : await pendingHome(tx, own),
        actions: await myActions(tx, principal.userId),
        committees: await committeesOf(tx, principal.userId, today),
      };
    });
  }

  /** Colaboradores activos (para elegir a quién va un examen, una entrega o una inspección). */
  async employees(principal: Principal): Promise<SstRef[]> {
    return this.database.withTenant(principal, async (tx) =>
      (await activeEmployeesForSst(tx)).map(({ id, name }) => ({ id, name })),
    );
  }

  /** Cuentas internas activas (para elegir responsables e integrantes de comités). */
  async people(principal: Principal): Promise<SstRef[]> {
    return this.database.withTenant(principal, async (tx) =>
      (await activeCollaborators(tx)).map((person) => ({
        id: person.id,
        name: person.displayName ?? person.email,
      })),
    );
  }
}
