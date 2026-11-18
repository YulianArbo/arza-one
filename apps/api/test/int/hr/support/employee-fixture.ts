import { v7 as uuidv7 } from 'uuid';

import { bogotaToday, fromCalendarDate } from '../../../../src/modules/core/index.js';
import type { AccessScenario } from '../../iam/support/access-scenario.js';

// Colaboradores de prueba de Talento humano (B35) sin pasar por la firma: por vincular, con su
// lista de chequeo, una tarea de inducción y, si se pide, un contrato en preparación.

type Tx = Parameters<Parameters<AccessScenario['inTenant']>[0]>[0];

async function preparingContract(tx: Tx, tenantId: string, employeeId: string, day: Date) {
  await tx.hrContract.create({
    data: {
      tenantId,
      employeeId,
      type: 'indefinite',
      startsOn: day,
      salaryBand: 'BANDA_1',
      salary: '2500000',
      signBy: day,
      companySignerId: uuidv7(),
      sentBy: uuidv7(),
      requestKey: uuidv7(),
    },
  });
}

async function checklistAndTask(tx: Tx, tenantId: string, employeeId: string, day: Date) {
  await tx.hrFileChecklistItem.createMany({
    data: ['education', 'signed_contract'].map((item) => ({ tenantId, employeeId, item })),
  });
  return tx.hrOnboardingTask.create({
    data: { tenantId, employeeId, kind: 'induction', task: 'Inducción institucional', dueOn: day },
  });
}

export async function pendingEmployee(
  scenario: AccessScenario,
  options: { readonly contract: boolean },
): Promise<{ readonly id: string; readonly taskId: string }> {
  const tenantId = scenario.tenant.id;
  const day = fromCalendarDate(bogotaToday(scenario.clock.now()));
  return scenario.inTenant(async (tx) => {
    const employee = await tx.hrEmployee.create({
      data: {
        tenantId,
        partyId: uuidv7(),
        positionId: uuidv7(),
        hireDate: day,
        contractType: 'indefinite',
        workMode: 'on_site',
        workEmail: `${uuidv7()}@arza.test`,
        requestKey: uuidv7(),
      },
    });
    const task = await checklistAndTask(tx, tenantId, employee.id, day);
    if (options.contract) await preparingContract(tx, tenantId, employee.id, day);
    return { id: employee.id, taskId: task.id };
  });
}
