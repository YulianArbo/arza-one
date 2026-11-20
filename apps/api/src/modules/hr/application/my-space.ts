import { Inject, Injectable } from '@nestjs/common';
import {
  mySpaceResponseSchema,
  type MySpace,
  type PayrollNovelty,
  type TeamMember,
} from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, catalogLabels, positionsById, toCalendarDate } from '../../core/index.js';
import { SALARY_BANDS } from './employee-records.js';
import { employeeOfUser, employeeRefs, managerOf, refOf, teamOf, userRefs } from './hr-support.js';
import { vacationBalance } from './leave-views.js';
import { noveltyViews } from './payroll-periods.js';

// «Mi espacio» (B36, ficha 17.13 y numeral 15.4 «Propiedad»): cada persona ve sus datos laborales,
// su saldo de vacaciones y sus novedades; quien es jefe ve además a su equipo directo con su saldo.
// Del salario solo ve la banda (decisión 11).

async function contractSummary(tx: TenantTransaction, employeeId: string) {
  const contract = await tx.hrContract.findFirst({
    where: { employeeId, deletedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    select: { salaryBand: true, status: true, documentId: true },
  });
  const bands = await catalogLabels(tx, SALARY_BANDS);
  return {
    band: contract === null ? null : (bands.get(contract.salaryBand) ?? contract.salaryBand),
    available: contract?.status === 'signed' && contract.documentId !== null,
  };
}

@Injectable()
export class MySpaceQueries {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async summary(principal: Principal): Promise<MySpace> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const employee = await employeeOfUser(tx, principal.userId);
      if (employee === null) return { employment: null };
      const name = (await employeeRefs(tx, [employee])).get(employee.id)?.name ?? 'Colaborador';
      const position = (await positionsById(tx, [employee.positionId])).get(employee.positionId);
      const managerId = await managerOf(tx, employee);
      const manager = refOf(await userRefs(tx, [managerId]), managerId);
      const contract = await contractSummary(tx, employee.id);
      return mySpaceResponseSchema.parse({
        employment: {
          employee_id: employee.id,
          name,
          position: { id: employee.positionId, name: position?.name ?? 'Cargo' },
          hire_date: toCalendarDate(employee.hireDate),
          contract_type: employee.contractType,
          work_mode: employee.workMode,
          salary_band_label: contract.band,
          contract_available: contract.available,
          manager,
          vacation: await vacationBalance(tx, employee, today),
          has_team: (await teamOf(tx, principal.userId)).length > 0,
        },
      });
    });
  }

  /** Las novedades de nómina propias, de la más reciente a la más antigua. */
  async novelties(principal: Principal): Promise<PayrollNovelty[]> {
    return this.database.withTenant(principal, async (tx) => {
      const employee = await employeeOfUser(tx, principal.userId);
      if (employee === null) return [];
      const rows = await tx.hrPayrollNovelty.findMany({
        where: { employeeId: employee.id, deletedAt: null },
        orderBy: [{ period: 'desc' }, { startsOn: 'desc' }, { id: 'asc' }],
        take: 200,
      });
      return noveltyViews(tx, rows);
    });
  }

  /** El equipo directo de quien consulta, con el saldo de vacaciones de cada persona. */
  async team(principal: Principal): Promise<TeamMember[]> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const members = await teamOf(tx, principal.userId);
      const names = await employeeRefs(tx, members);
      const positions = await positionsById(
        tx,
        members.map(({ positionId }) => positionId),
      );
      const team: TeamMember[] = [];
      for (const member of members) {
        team.push({
          employee_id: member.id,
          name: names.get(member.id)?.name ?? 'Colaborador',
          position: {
            id: member.positionId,
            name: positions.get(member.positionId)?.name ?? 'Cargo',
          },
          vacation_available: (await vacationBalance(tx, member, today)).available,
        });
      }
      return team;
    });
  }
}
