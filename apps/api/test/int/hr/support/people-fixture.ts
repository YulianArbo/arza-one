import { v7 as uuidv7 } from 'uuid';

import { addDays, bogotaToday, fromCalendarDate } from '../../../../src/modules/core/index.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';

// Personas de prueba del B36: un jefe y su colaborador directo (el cargo del colaborador reporta al
// del jefe en el organigrama), una persona de Talento humano y un compañero sin equipo. Cada
// colaborador queda activo con contrato firmado, como después de la vinculación del B35.

type Tx = Parameters<Parameters<AccessScenario['inTenant']>[0]>[0];

export interface Staff {
  readonly hr: Person;
  readonly boss: Person;
  readonly worker: Person;
  readonly peer: Person;
  readonly workerEmployeeId: string;
  readonly bossEmployeeId: string;
  readonly peerEmployeeId: string;
}

export interface Positions {
  readonly boss: string;
  readonly worker: string;
}

async function positions(tx: Tx, tenantId: string): Promise<Positions> {
  const unit = await tx.orgUnit.create({
    data: {
      tenantId,
      code: `TH${uuidv7().slice(-8).toUpperCase()}`,
      name: 'Operación',
      kind: 'area',
    },
  });
  const boss = await tx.position.create({
    data: { tenantId, orgUnitId: unit.id, name: 'Coordinador de prueba' },
  });
  const worker = await tx.position.create({
    data: { tenantId, orgUnitId: unit.id, name: 'Analista de prueba', reportsToId: boss.id },
  });
  return { boss: boss.id, worker: worker.id };
}

async function personFor(tx: Tx, tenantId: string): Promise<string> {
  const party = await tx.party.create({
    data: {
      tenantId,
      kind: 'person',
      firstName: 'Persona',
      lastName: `Prueba ${uuidv7().slice(-4)}`,
      idType: 'CC',
      idNumber: String(Date.now()).slice(-10) + String(Math.floor(Math.random() * 90) + 10),
    },
  });
  return party.id;
}

async function signedContract(tx: Tx, tenantId: string, employeeId: string, day: Date) {
  await tx.hrContract.create({
    data: {
      tenantId,
      employeeId,
      type: 'indefinite',
      startsOn: day,
      salaryBand: 'BANDA_2',
      salary: '3500000',
      status: 'signed',
      signBy: day,
      signedOn: day,
      envelopeId: uuidv7(),
      documentId: uuidv7(),
      companySignerId: uuidv7(),
      sentBy: uuidv7(),
      requestKey: uuidv7(),
    },
  });
}

/** Colaborador activo con contrato firmado, ligado a la cuenta y con el cargo dado. */
export async function activeEmployee(
  tx: Tx,
  link: { readonly tenantId: string; readonly userId: string; readonly positionId: string },
  hireDate: string,
): Promise<string> {
  const { tenantId, userId, positionId } = link;
  await tx.user.update({ where: { id: userId }, data: { positionId } });
  const day = fromCalendarDate(hireDate);
  const employee = await tx.hrEmployee.create({
    data: {
      tenantId,
      partyId: await personFor(tx, tenantId),
      positionId,
      hireDate: day,
      contractType: 'indefinite',
      workMode: 'on_site',
      workEmail: `${uuidv7()}@arza.test`,
      requestKey: uuidv7(),
    },
  });
  await signedContract(tx, tenantId, employee.id, day);
  await tx.hrEmployee.update({
    where: { id: employee.id },
    data: { status: 'active', userId, activatedAt: new Date(), activatedBy: userId },
  });
  return employee.id;
}

/** Jefe, colaborador y compañero activos desde hace un año, y una persona de Talento humano. */
export async function staffFixture(scenario: AccessScenario, label: string): Promise<Staff> {
  const hr = await scenario.person(`${label}-th`, ['TALENTO_HUMANO', 'COLABORADOR']);
  const boss = await scenario.person(`${label}-jefe`, ['COLABORADOR']);
  const worker = await scenario.person(`${label}-colaborador`, ['COLABORADOR']);
  const peer = await scenario.person(`${label}-par`, ['COLABORADOR']);
  const tenantId = scenario.tenant.id;
  const hired = addDays(bogotaToday(scenario.clock.now()), -366);
  const ids = await scenario.inTenant(async (tx) => {
    const chart = await positions(tx, tenantId);
    const link = (userId: string, positionId: string) =>
      activeEmployee(tx, { tenantId, userId, positionId }, hired);
    return {
      boss: await link(boss.id, chart.boss),
      worker: await link(worker.id, chart.worker),
      peer: await link(peer.id, chart.worker),
    };
  });
  return {
    hr,
    boss,
    worker,
    peer,
    workerEmployeeId: ids.worker,
    bossEmployeeId: ids.boss,
    peerEmployeeId: ids.peer,
  };
}

/** Una fecha hábil (de lunes a viernes) al menos `days` días después de hoy. */
export function weekdayAfter(scenario: AccessScenario, days: number): string {
  let date = addDays(bogotaToday(scenario.clock.now()), days);
  for (;;) {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) return date;
    date = addDays(date, 1);
  }
}

/** Un soporte ya revisado por el antivirus que la persona subió: se puede adjuntar. */
export async function availableFile(scenario: AccessScenario, owner: Person): Promise<string> {
  const tenantId = scenario.tenant.id;
  const file = await scenario.db.withTenant({ tenantId, userId: owner.id }, (tx) =>
    tx.file.create({
      data: {
        tenantId,
        storageKey: `${tenantId}/${uuidv7()}`,
        fileName: 'soporte.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        scanStatus: 'available',
        scannedAt: scenario.clock.now(),
        sha256: 'b'.repeat(64),
      },
    }),
  );
  return file.id;
}
