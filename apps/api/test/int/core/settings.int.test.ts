import {
  businessDaysResponseSchema,
  catalogDetailResponseSchema,
  holidayListResponseSchema,
  parameterHistoryResponseSchema,
  parameterListResponseSchema,
} from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { auditActions, errorCode } from '../iam/support/iam-fixtures.js';
import { CoreScenario, unique } from './support/core-scenario.js';

// Parámetros con vigencia, catálogos, festivos y días hábiles (B12, ficha 17.1).

const scenario = new CoreScenario('parámetros');

const SCHEDULE = {
  days: [1, 2, 3, 4, 5],
  morning: { start: '07:00', end: '12:00' },
  afternoon: { start: '13:00', end: '16:00' },
};

function dayFromToday(days: number): string {
  const bogota = new Date(scenario.clock.now().getTime() - 5 * 3_600_000 + days * 86_400_000);
  return bogota.toISOString().slice(0, 10);
}

describe('parámetros con vigencia', () => {
  it('una vigencia nueva conserva la anterior y audita el valor anterior y el nuevo', async () => {
    const admin = await scenario.admin();
    const before = parameterListResponseSchema
      .parse((await scenario.get('/v1/parameters', admin.session)).body)
      .data.find((parameter) => parameter.key === 'work.schedule');
    expect(before?.current?.value).toMatchObject({ morning: { start: '08:00', end: '12:00' } });
    const validFrom = dayFromToday(30);
    const body = { value: SCHEDULE, valid_from: validFrom };
    const created = await scenario.post(
      '/v1/parameters/work.schedule/versions',
      admin.session,
      body,
    );
    expect(created.status, created.text).toBe(204);
    const history = parameterHistoryResponseSchema.parse(
      (await scenario.get('/v1/parameters/work.schedule/history', admin.session)).body,
    );
    expect(history.data.map((v) => [v.valid_from, v.valid_to])).toEqual([
      [validFrom, null],
      ['2026-01-01', dayFromToday(29)],
    ]);
    expect(history.data[0]?.created_by?.id).toBe(admin.id);
    const event = await scenario.inTenant((tx) =>
      tx.auditEvent.findFirstOrThrow({ where: { action: 'core.parameter.update' } }),
    );
    expect(event.changes).toMatchObject({
      value: { from: { morning: { start: '08:00' } }, to: { morning: { start: '07:00' } } },
      valid_from: validFrom,
    });
  });
});

describe('parámetros: validaciones', () => {
  it('no reescribe el pasado ni acepta valores fuera del esquema ni claves desconocidas', async () => {
    const admin = await scenario.admin();
    const path = '/v1/parameters/work.schedule/versions';
    const past = { value: SCHEDULE, valid_from: dayFromToday(-1) };
    expect(errorCode(await scenario.post(path, admin.session, past))).toBe(
      'CORE_PARAMETER_VALID_FROM_INVALID',
    );
    const wrong = { value: { ...SCHEDULE, days: [] }, valid_from: dayFromToday(60) };
    expect((await scenario.post(path, admin.session, wrong)).status).toBe(422);
    const unknown = { value: SCHEDULE, valid_from: dayFromToday(60) };
    expect(
      errorCode(await scenario.post('/v1/parameters/no.existe/versions', admin.session, unknown)),
    ).toBe('CORE_PARAMETER_UNKNOWN');
  });

  it('cada parámetro acepta solo el valor de su clave (B23: tope de descuento)', async () => {
    const admin = await scenario.admin();
    const path = '/v1/parameters/crm.discount_cap/versions';
    const schedule = { value: SCHEDULE, valid_from: dayFromToday(60) };
    expect(errorCode(await scenario.post(path, admin.session, schedule))).toBe(
      'CORE_PARAMETER_VALUE_INVALID',
    );
    const cap = { value: { percent: '15' }, valid_from: dayFromToday(60) };
    expect((await scenario.post(path, admin.session, cap)).status).toBe(204);
    const history = parameterHistoryResponseSchema.parse(
      (await scenario.get('/v1/parameters/crm.discount_cap/history', admin.session)).body,
    );
    expect(history.data.map((version) => version.value)).toEqual([
      { percent: '15' },
      { percent: '10.00' },
    ]);
  });
});

describe('parámetros: protección en la base de datos', () => {
  it('la base de datos tampoco deja modificar una vigencia cerrada', async () => {
    await expect(
      scenario.inTenant((tx) =>
        tx.parameter.updateMany({ where: { validTo: { not: null } }, data: { value: SCHEDULE } }),
      ),
    ).rejects.toThrow(/no se modifica/);
  });
});

describe('catálogos', () => {
  it('agrega, edita e inactiva opciones; el código no se repite', async () => {
    const admin = await scenario.admin();
    const path = '/v1/catalogs/identification_types';
    const code = unique('X');
    const id = await scenario.create(`${path}/items`, admin, {
      code,
      label: 'Documento extranjero',
    });
    expect(
      errorCode(await scenario.post(`${path}/items`, admin.session, { code, label: 'Otro' })),
    ).toBe('CORE_CODE_TAKEN');
    const update = { label: 'Documento extranjero', sort_order: 5, is_active: false };
    expect((await scenario.patch(`${path}/items/${id}`, admin.session, update, 1)).status).toBe(
      200,
    );
    const catalog = catalogDetailResponseSchema.parse(
      (await scenario.get(path, admin.session)).body,
    );
    expect(catalog.items.find((item) => item.id === id)).toMatchObject({
      is_active: false,
      sort_order: 5,
    });
    expect(catalog.items.map((item) => item.code)).toContain('CC');
    expect(await auditActions(scenario.db, scenario.tenant.id, id)).toEqual([
      'core.catalog_item.create:success',
      'core.catalog_item.update:success',
    ]);
  });
});

describe('festivos y días hábiles', () => {
  it('2026 trae sus 18 festivos y el plazo salta Semana Santa', async () => {
    const admin = await scenario.admin();
    const holidays = holidayListResponseSchema.parse(
      (await scenario.get('/v1/holidays?year=2026', admin.session)).body,
    );
    expect(holidays.data).toHaveLength(18);
    const deadline = await scenario.get('/v1/business-days?from=2026-03-31&days=2', admin.session);
    expect(businessDaysResponseSchema.parse(deadline.body).date).toBe('2026-04-06');
  });

  it('un día especial agregado cuenta como festivo; al quitarlo vuelve a ser hábil', async () => {
    const admin = await scenario.admin(scenario.otherTenant.id);
    const id = await scenario.create('/v1/holidays', admin, {
      date: '2026-09-15',
      name: 'Día cívico',
    });
    expect(
      errorCode(
        await scenario.post('/v1/holidays', admin.session, {
          date: '2026-09-15',
          name: 'Otra vez',
        }),
      ),
    ).toBe('CORE_HOLIDAY_TAKEN');
    const path = '/v1/business-days?from=2026-09-14&days=1';
    expect(
      businessDaysResponseSchema.parse((await scenario.get(path, admin.session)).body).date,
    ).toBe('2026-09-16');
    expect((await scenario.delete(`/v1/holidays/${id}`, admin.session)).status).toBe(204);
    expect(
      businessDaysResponseSchema.parse((await scenario.get(path, admin.session)).body).date,
    ).toBe('2026-09-15');
    await scenario.create('/v1/holidays', admin, { date: '2026-09-15', name: 'Día cívico' });
  });
});
