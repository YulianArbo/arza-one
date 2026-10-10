import { errorResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { auditActions, errorCode } from '../iam/support/iam-fixtures.js';
import { CoreScenario, unique } from './support/core-scenario.js';

// Procesos, cargos y centros de costo (B12, ficha 17.1): un cargo o proceso con registros
// asociados no se elimina, se inactiva; ninguna jerarquía deja a alguien por encima de sí mismo.

const scenario = new CoreScenario('estructura');

async function newUnit(parentId: string | null = null) {
  const admin = await scenario.admin();
  const code = unique('P');
  const id = await scenario.create('/v1/org-units', admin, {
    code,
    name: `Proceso ${code}`,
    kind: 'process',
    parent_id: parentId,
  });
  return { admin, id, code };
}

describe('procesos y áreas', () => {
  it('rechaza un código repetido y una jerarquía circular', async () => {
    const { admin, id, code } = await newUnit();
    const child = await scenario.create('/v1/org-units', admin, {
      code: unique('A'),
      name: 'Área hija',
      kind: 'area',
      parent_id: id,
    });
    const repeated = await scenario.post('/v1/org-units', admin.session, {
      code,
      name: 'Repetido',
      kind: 'process',
    });
    expect(errorCode(repeated)).toBe('CORE_CODE_TAKEN');
    const circular = {
      code,
      name: `Proceso ${code}`,
      kind: 'process',
      parent_id: child,
      owner_position_id: null,
      is_active: true,
    };
    expect(errorCode(await scenario.patch(`/v1/org-units/${id}`, admin.session, circular, 1))).toBe(
      'CORE_HIERARCHY_CYCLE',
    );
  });
});

describe('procesos y áreas: eliminar e inactivar', () => {
  it('un proceso con áreas o cargos no se elimina; inactivo sí se puede y sin uso se elimina', async () => {
    const { admin, id, code } = await newUnit();
    await scenario.create('/v1/positions', admin, { org_unit_id: id, name: 'Analista' });
    expect(errorCode(await scenario.delete(`/v1/org-units/${id}`, admin.session, 1))).toBe(
      'CORE_RECORD_IN_USE',
    );
    const inactive = {
      code,
      name: `Proceso ${code}`,
      kind: 'process',
      parent_id: null,
      owner_position_id: null,
      is_active: false,
    };
    const response = await scenario.patch(`/v1/org-units/${id}`, admin.session, inactive, 1);
    expect(response.body).toMatchObject({ is_active: false, version: 2 });
    const empty = await newUnit();
    expect((await scenario.delete(`/v1/org-units/${empty.id}`, admin.session, 1)).status).toBe(204);
    expect(await auditActions(scenario.db, scenario.tenant.id, empty.id)).toEqual([
      'core.org_unit.create:success',
      'core.org_unit.delete:success',
    ]);
  });
});

describe('cargos', () => {
  it('nadie reporta a quien le reporta', async () => {
    const { admin, id } = await newUnit();
    const boss = await scenario.create('/v1/positions', admin, { org_unit_id: id, name: 'Jefe' });
    const worker = await scenario.create('/v1/positions', admin, {
      org_unit_id: id,
      name: 'Auxiliar',
      reports_to_id: boss,
    });
    const loop = { org_unit_id: id, name: 'Jefe', reports_to_id: worker, is_active: true };
    expect(errorCode(await scenario.patch(`/v1/positions/${boss}`, admin.session, loop, 1))).toBe(
      'CORE_HIERARCHY_CYCLE',
    );
  });

  it('un cargo con personas o subordinados no se elimina', async () => {
    const { admin, id } = await newUnit();
    const boss = await scenario.create('/v1/positions', admin, { org_unit_id: id, name: 'Jefe' });
    const held = await scenario.create('/v1/positions', admin, {
      org_unit_id: id,
      name: 'Coordinador',
      reports_to_id: boss,
    });
    expect(errorCode(await scenario.delete(`/v1/positions/${boss}`, admin.session, 1))).toBe(
      'CORE_RECORD_IN_USE',
    );
    const person = await scenario.newUser('con-cargo');
    await scenario.inTenant((tx) =>
      tx.user.update({ where: { id: person.id }, data: { positionId: held } }),
    );
    const response = await scenario.delete(`/v1/positions/${held}`, admin.session, 1);
    expect(errorResponseSchema.parse(response.body).error.message).toContain(
      'hay personas con ese cargo',
    );
  });
});

describe('centros de costo', () => {
  it('se crean ligados a un proceso, se editan con la versión vista y se eliminan', async () => {
    const { admin, id } = await newUnit();
    const code = unique('CC-');
    const center = await scenario.create('/v1/cost-centers', admin, {
      code,
      name: 'Operación',
      org_unit_id: id,
    });
    const update = { code, name: 'Operación central', org_unit_id: id, is_active: true };
    const edited = await scenario.patch(`/v1/cost-centers/${center}`, admin.session, update, 1);
    expect(edited.body).toMatchObject({ name: 'Operación central', version: 2 });
    expect(
      errorCode(await scenario.patch(`/v1/cost-centers/${center}`, admin.session, update, 1)),
    ).toBe('VERSION_CONFLICT');
    expect(errorCode(await scenario.delete(`/v1/org-units/${id}`, admin.session, 1))).toBe(
      'CORE_RECORD_IN_USE',
    );
    expect((await scenario.delete(`/v1/cost-centers/${center}`, admin.session, 2)).status).toBe(
      204,
    );
  });
});
