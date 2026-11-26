import { nitCheckDigit } from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  runInitialLoad,
  type LoadReport,
} from '../../../src/modules/golive/application/initial-load.js';
import type { LoadFiles } from '../../../src/modules/golive/application/load-context.js';
import { seedCore } from '../../../src/modules/core/index.js';
import { InvitationUseCase } from '../../../src/modules/iam/index.js';
import { systemClock } from '../../../src/platform/clock/clock.js';
import { toCsv } from '../../../src/platform/export/csv.js';
import { AccessScenario, type Person } from '../iam/support/access-scenario.js';
import { tenantScope } from '../iam/support/iam-fixtures.js';

// Carga inicial de la puesta en marcha (B45): revisar sin cambiar nada, aplicar con la misma
// auditoría de las pantallas, repetir sin duplicar, exigir los permisos de cada dato y no mezclar
// empresas. Todos los datos son ficticios (correos @pruebas.test y NIT inventados).

const scenario = new AccessScenario('carga inicial');

const NIT = '901234567';

// Las dos empresas con la semilla del núcleo, como en producción: catálogos y organigrama DC-SGC-001.
beforeAll(async () => {
  await seedCore(scenario.db, [scenario.tenant.id, scenario.otherTenant.id], systemClock);
});

function files(suffix: string): LoadFiles {
  const area = `MER-${suffix}`;
  const boss = `Jefe de Mercadeo ${suffix}`;
  return {
    areas: toCsv(
      ['Código', 'Nombre', 'Tipo', 'Depende de', 'Cargo líder'],
      [[area, 'Mercadeo', 'Proceso', null, boss]],
    ),
    positions: toCsv(['Cargo', 'Proceso o área', 'Reporta a'], [[boss, area, null]]),
    users: toCsv(
      ['Correo', 'Nombre', 'Cargo', 'Roles'],
      [[`mercadeo-${suffix.toLowerCase()}@pruebas.test`, 'Persona Ficticia', boss, 'COMERCIAL']],
    ),
    companies: toCsv(
      ['NIT', 'DV', 'Razón social', 'Papel'],
      [[NIT, String(nitCheckDigit(NIT)), 'Cliente Ficticio S.A.S.', 'Cliente | Proveedor']],
    ),
  };
}

function load(person: Person, loadFiles: LoadFiles, apply: boolean, tenantId = scenario.tenant.id) {
  return runInitialLoad(
    {
      database: scenario.db,
      clock: scenario.clock,
      invitations: scenario.app.get(InvitationUseCase),
    },
    { tenantId, userId: person.id, files: loadFiles, apply },
  );
}

function counts(report: LoadReport) {
  return report.sheets.map((sheet) => [sheet.sheet, sheet.planned, sheet.created, sheet.existing]);
}

/** Lo que dejó la carga en la empresa, por las claves de la plantilla. */
function loaded(suffix: string, tenantId = scenario.tenant.id) {
  return tenantScope(
    scenario.db,
    tenantId,
  )(async (tx) => ({
    unit: await tx.orgUnit.findFirst({ where: { code: `MER-${suffix}` } }),
    position: await tx.position.findFirst({ where: { name: `Jefe de Mercadeo ${suffix}` } }),
    user: await tx.user.findFirst({
      where: { email: `mercadeo-${suffix.toLowerCase()}@pruebas.test` },
      include: { roleAssignments: { include: { role: true } } },
    }),
    company: await tx.party.findFirst({ where: { idNumber: NIT }, include: { roles: true } }),
  }));
}

function loader(label: string, tenantId = scenario.tenant.id) {
  return scenario.person(label, ['ADMIN_PLATAFORMA', 'COMERCIAL'], { tenantId });
}

describe('revisar', () => {
  it('sin aplicar solo informa lo que se crearía', async () => {
    const suffix = uuidv7().slice(-6).toUpperCase();
    const report = await load(await loader('revisa'), files(suffix), false);
    expect(report.applied).toBe(false);
    expect(counts(report)).toEqual([
      ['estructura', 2, 0, 0],
      ['usuarios', 1, 0, 0],
      ['terceros', 1, 0, 0],
    ]);
    const after = await loaded(suffix);
    expect([after.unit, after.position, after.user]).toEqual([null, null, null]);
  });
});

/** Las altas enlazadas entre sí: proceso con su líder, cargo en su proceso, persona en su cargo. */
async function expectLinked(suffix: string): Promise<void> {
  const after = await loaded(suffix);
  expect(after.unit?.ownerPositionId).toBe(after.position?.id);
  expect(after.position?.orgUnitId).toBe(after.unit?.id);
  expect(after.user).toMatchObject({
    status: 'invited',
    mfaRequired: true,
    positionId: after.position?.id,
  });
  expect(after.user?.roleAssignments.map((item) => item.role.code).sort()).toEqual([
    'COLABORADOR',
    'COMERCIAL',
  ]);
  expect(after.company?.roles.map((item) => item.role).sort()).toEqual(['customer', 'supplier']);
}

/** Cada alta deja el evento de la pantalla, a nombre de quien cargó y marcado como carga. */
async function expectAudited(person: Person): Promise<void> {
  const events = await scenario.inTenant((tx) =>
    tx.auditEvent.findMany({ where: { actorId: person.id }, orderBy: { seq: 'asc' } }),
  );
  expect(events.map((event) => event.action)).toEqual(
    expect.arrayContaining([
      'core.org_unit.create',
      'core.position.create',
      'core.org_unit.update',
      'iam.user.invite',
      'party.create',
    ]),
  );
  const imported = events.filter((event) =>
    JSON.stringify(event.changes).includes('"source":"import"'),
  );
  expect(imported.length).toBeGreaterThanOrEqual(4);
}

describe('aplicar', () => {
  it('crea todo enlazado, con auditoría, y una segunda corrida no duplica nada', async () => {
    const suffix = uuidv7().slice(-6).toUpperCase();
    const person = await loader('aplica');
    const first = await load(person, files(suffix), true);
    expect(first.applied).toBe(true);
    expect(counts(first), JSON.stringify(first.sheets)).toEqual([
      ['estructura', 2, 2, 0],
      ['usuarios', 1, 1, 0],
      ['terceros', 1, 1, 0],
    ]);
    await expectLinked(suffix);
    await expectAudited(person);
    const again = await load(person, files(suffix), true);
    expect(counts(again)).toEqual([
      ['estructura', 0, 0, 2],
      ['usuarios', 0, 0, 1],
      ['terceros', 0, 0, 1],
    ]);
  });

  it('con un solo problema no carga nada', async () => {
    const suffix = uuidv7().slice(-6).toUpperCase();
    const broken = {
      ...files(suffix),
      companies: toCsv(
        ['NIT', 'DV', 'Razón social', 'Papel'],
        [['123456789', '0', 'Mal S.A.S.', 'Cliente']],
      ),
    };
    const report = await load(await loader('problema'), broken, true);
    expect(report.applied).toBe(false);
    expect(report.sheets.find((sheet) => sheet.sheet === 'terceros')?.problems).toHaveLength(1);
    expect((await loaded(suffix)).unit).toBeNull();
  });
});

function filesWithWriteFailures(rejectedEmail: string, acceptedEmail: string, nits: string[]) {
  return {
    users: toCsv(
      ['Correo', 'Nombre', 'Cargo', 'Roles'],
      [
        [rejectedEmail, 'Persona Rechazada', null, null],
        [acceptedEmail, 'Persona Aceptada', null, null],
      ],
    ),
    companies: toCsv(
      ['NIT', 'DV', 'Razón social', 'Papel'],
      nits.map((nit) => [nit, String(nitCheckDigit(nit)), `Empresa ${nit} S.A.S.`, 'Cliente']),
    ),
  };
}

function dependenciesWithWriteFailures(failure: unknown) {
  const invitations = scenario.app.get(InvitationUseCase);
  const invite = vi.fn(invitations.invite.bind(invitations)).mockRejectedValueOnce(failure);
  // La primera lectura valida los permisos y la segunda corresponde al alta del primer tercero.
  const now = vi
    .fn(() => scenario.clock.now())
    .mockImplementationOnce(() => scenario.clock.now())
    .mockImplementationOnce(() => {
      throw new Error('Alta de tercero no disponible');
    });
  return { database: scenario.db, clock: { now }, invitations: { invite } };
}

describe('errores durante la carga', () => {
  it.each([
    { failure: new Error('Alta no disponible'), problem: 'Alta no disponible', nit: '901234569' },
    { failure: 'Alta no disponible', problem: 'no se pudo crear', nit: '901234570' },
  ])('informa por fila los errores de alta como «$problem»', async ({ failure, problem, nit }) => {
    const suffix = uuidv7().slice(-6);
    const rejectedEmail = `rechazada-${suffix}@pruebas.test`;
    const acceptedEmail = `aceptada-${suffix}@pruebas.test`;
    const rejectedNit = '901234568';
    const person = await loader('errores-de-alta');
    const report = await runInitialLoad(dependenciesWithWriteFailures(failure), {
      tenantId: scenario.tenant.id,
      userId: person.id,
      apply: true,
      files: filesWithWriteFailures(rejectedEmail, acceptedEmail, [rejectedNit, nit]),
    });

    expect(report.applied).toBe(true);
    expect(report.sheets).toEqual([
      { sheet: 'estructura', planned: 0, created: 0, existing: 0, problems: [] },
      {
        sheet: 'usuarios',
        planned: 2,
        created: 1,
        existing: 0,
        problems: [{ row: 2, key: rejectedEmail, problem }],
      },
      {
        sheet: 'terceros',
        planned: 2,
        created: 1,
        existing: 0,
        problems: [{ row: 2, key: rejectedNit, problem: 'Alta de tercero no disponible' }],
      },
    ]);
  });
});

describe('permisos', () => {
  it('sin los permisos de las pantallas no revisa ni carga nada', async () => {
    const suffix = uuidv7().slice(-6).toUpperCase();
    const colaborador = await scenario.person('sin-permisos', ['COLABORADOR']);
    const report = await load(colaborador, files(suffix), true);
    expect(report.missingPermissions).toEqual([
      'core.org.manage',
      'iam.user.invite',
      'iam.role.assign',
      'party.create',
    ]);
    expect(report.sheets).toEqual([]);
    expect((await loaded(suffix)).unit).toBeNull();
  });

  it('el administrador sin papel comercial no carga terceros (separación de funciones)', async () => {
    const admin = await scenario.person('solo-admin', ['ADMIN_PLATAFORMA']);
    const report = await load(admin, { companies: files('X').companies }, true);
    expect(report.missingPermissions).toEqual(['party.create']);
  });
});

describe('aislamiento entre empresas', () => {
  it('lo cargado en una empresa no existe en la otra, que carga lo suyo por separado', async () => {
    const suffix = uuidv7().slice(-6).toUpperCase();
    await load(await loader('empresa-a'), files(suffix), true);
    const elsewhere = await loaded(suffix, scenario.otherTenant.id);
    expect([elsewhere.unit, elsewhere.position, elsewhere.user]).toEqual([null, null, null]);

    const other = await loader('empresa-b', scenario.otherTenant.id);
    const otherFiles = {
      areas: files(suffix).areas,
      positions: files(suffix).positions,
      companies: files(suffix).companies,
    };
    const report = await load(other, otherFiles, false, scenario.otherTenant.id);
    expect(counts(report).filter(([sheet]) => sheet !== 'usuarios')).toEqual([
      ['estructura', 2, 0, 0],
      ['terceros', 1, 0, 0],
    ]);
  });

  it('quien carga actúa solo en su empresa aunque se le indique otra', async () => {
    const suffix = uuidv7().slice(-6).toUpperCase();
    const person = await loader('intruso');
    await expect(load(person, files(suffix), true, scenario.otherTenant.id)).resolves.toMatchObject(
      {
        missingPermissions: [
          'core.org.manage',
          'iam.user.invite',
          'iam.role.assign',
          'party.create',
        ],
      },
    );
    expect((await loaded(suffix, scenario.otherTenant.id)).unit).toBeNull();
  });
});
