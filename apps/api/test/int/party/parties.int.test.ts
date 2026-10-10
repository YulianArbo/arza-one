import {
  partyListResponseSchema,
  partySearchResponseSchema,
  type PartySummary,
} from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import {
  PartyScenario,
  organizationBody,
  personBody,
  uniqueNit,
} from './support/party-scenario.js';

// Ficha del tercero (B13, ficha 17.3): registro, documento único con dígito del NIT, posibles
// duplicados, estados y papeles.

const scenario = new PartyScenario('terceros');

describe('registro del tercero', () => {
  it('registra una organización y una persona con su autorización de datos', async () => {
    const sales = await scenario.sales();
    const org = await scenario.party(sales, organizationBody({ trade_name: 'Andina' }));
    const person = await scenario.party(sales, personBody({ phone: '+57 310 555 0101' }));
    const orgDetail = await scenario.detail(sales, org);
    expect(orgDetail).toMatchObject({
      kind: 'organization',
      status: 'active',
      roles: ['customer'],
    });
    expect(orgDetail.due_diligence).toEqual({ state: 'none', next_review_on: null });
    const personDetail = await scenario.detail(sales, person);
    expect(personDetail).toMatchObject({
      kind: 'person',
      data_purpose: 'COMMERCIAL',
      data_authorization: 'written',
      data_authorized_on: '2026-10-01',
      phone: '+573105550101',
    });
  });

  it('con documento repetido responde 409 y la búsqueda ofrece el existente', async () => {
    const sales = await scenario.sales();
    const body = organizationBody();
    const id = await scenario.party(sales, body);
    const again = await scenario.post('/v1/parties', sales.session, {
      ...body,
      legal_name: 'Otra',
    });
    expect(errorCode(again)).toBe('PARTY_DUPLICATE');
    const search = await scenario.get(
      `/v1/parties/search?id_number=${String(body.id_number)}`,
      sales.session,
    );
    const found = partySearchResponseSchema.parse(search.body).data;
    expect(found.map((row) => [row.party.id, row.reasons])).toEqual([[id, ['id_number']]]);
  });
});

describe('registro del tercero: validaciones', () => {
  it('rechaza el NIT con dígito equivocado, en la API y en la base de datos', async () => {
    const sales = await scenario.sales();
    const nit = uniqueNit();
    const wrong = organizationBody({ ...nit, check_digit: (nit.check_digit + 1) % 10 });
    const response = await scenario.post('/v1/parties', sales.session, wrong);
    expect(response.status).toBe(422);
    const insert = scenario.inTenant((tx) =>
      tx.party.create({
        data: {
          tenantId: scenario.tenant.id,
          kind: 'organization',
          legalName: 'Sin control',
          idType: 'NIT',
          idNumber: nit.id_number,
          checkDigit: (nit.check_digit + 1) % 10,
        },
      }),
    );
    await expect(insert).rejects.toThrow(/pty_parties_check_digit_check/);
  });

  it('no acepta opciones que no están en los catálogos activos', async () => {
    const sales = await scenario.sales();
    const badType = await scenario.post(
      '/v1/parties',
      sales.session,
      personBody({ id_type: 'XX' }),
    );
    expect(errorCode(badType)).toBe('PARTY_CATALOG_VALUE_INVALID');
    const badPurpose = personBody({ data_purpose: 'NOPE' });
    const response = await scenario.post('/v1/parties', sales.session, badPurpose);
    expect(errorCode(response)).toBe('PARTY_CATALOG_VALUE_INVALID');
  });
});

describe('posibles duplicados', () => {
  it('encuentra por correo, teléfono y nombre escrito distinto', async () => {
    const sales = await scenario.sales();
    const name = `Ferretería Sur ${String(Date.now())}`;
    const id = await scenario.party(
      sales,
      organizationBody({
        legal_name: `${name} S.A.S.`,
        email: 'ventas@sur.example',
        phone: '6045550199',
      }),
    );
    const query = new URLSearchParams({
      name: `${name.toUpperCase()} sas`,
      email: 'VENTAS@sur.example',
      phone: '+57 604 555 0199',
    });
    const response = await scenario.get(`/v1/parties/search?${query.toString()}`, sales.session);
    const match = partySearchResponseSchema
      .parse(response.body)
      .data.find((row) => row.party.id === id);
    expect(match?.reasons).toEqual(['email', 'phone', 'name']);
    const excluded = await scenario.get(
      `/v1/parties/search?${query.toString()}&exclude_id=${id}`,
      sales.session,
    );
    const ids = partySearchResponseSchema.parse(excluded.body).data.map((row) => row.party.id);
    expect(ids).not.toContain(id);
  });
});

describe('edición, estados y papeles', () => {
  it('edita con la versión vista y avisa si otra persona cambió el registro', async () => {
    const sales = await scenario.sales();
    const body = organizationBody();
    const id = await scenario.party(sales, body);
    const edit = { ...body, roles: undefined, city: 'Bogotá' };
    expect((await scenario.patch(`/v1/parties/${id}`, sales.session, edit, 1)).status).toBe(204);
    const stale = await scenario.patch(`/v1/parties/${id}`, sales.session, edit, 1);
    expect(errorCode(stale)).toBe('VERSION_CONFLICT');
    const asPerson = await scenario.patch(`/v1/parties/${id}`, sales.session, personBody(), 2);
    expect(errorCode(asPerson)).toBe('PARTY_KIND_CHANGE');
    expect((await scenario.detail(sales, id)).city).toBe('Bogotá');
  });

  it('sigue el flujo de estados y exige motivo para bloquear', async () => {
    const sales = await scenario.sales();
    const id = await scenario.party(sales, organizationBody({ status: 'prospect' }));
    const path = `/v1/parties/${id}/actions/change-status`;
    const change = (body: object, version: number) =>
      scenario.postVersioned(path, sales.session, body, version);
    expect((await change({ status: 'blocked' }, 1)).status).toBe(422);
    expect((await change({ status: 'active' }, 1)).status).toBe(204);
    expect(errorCode(await change({ status: 'prospect' }, 2))).toBe(
      'PARTY_STATUS_TRANSITION_INVALID',
    );
    expect(
      (await change({ status: 'blocked', reason: 'Reportado en lista restrictiva' }, 2)).status,
    ).toBe(204);
    const detail = await scenario.detail(sales, id);
    expect([detail.status, detail.status_reason]).toEqual([
      'blocked',
      'Reportado en lista restrictiva',
    ]);
  });
});

describe('papeles del tercero', () => {
  it('agrega y termina papeles sin perder el historial', async () => {
    const sales = await scenario.sales();
    const id = await scenario.party(sales);
    expect(
      (await scenario.post(`/v1/parties/${id}/roles`, sales.session, { role: 'supplier' })).status,
    ).toBe(204);
    expect((await scenario.delete(`/v1/parties/${id}/roles/customer`, sales.session)).status).toBe(
      204,
    );
    expect((await scenario.delete(`/v1/parties/${id}/roles/jefe`, sales.session)).status).toBe(422);
    const detail = await scenario.detail(sales, id);
    expect(detail.roles).toEqual(['supplier']);
    expect(detail.role_history.map((row) => [row.role, row.is_active])).toEqual([
      ['customer', false],
      ['supplier', true],
    ]);
  });
});

describe('listado', () => {
  it('busca, filtra por papel y estado y pagina', async () => {
    const sales = await scenario.sales();
    const tag = `Listado${String(Date.now())}`;
    const ids = [];
    for (const index of [1, 2, 3]) {
      ids.push(
        await scenario.party(sales, organizationBody({ legal_name: `${tag} ${String(index)}` })),
      );
    }
    await scenario.post(`/v1/parties/${ids[0] ?? ''}/roles`, sales.session, { role: 'supplier' });
    const page = async (query: string): Promise<{ data: PartySummary[]; next: string | null }> => {
      const response = await scenario.get(`/v1/parties?q=${tag}&${query}`, sales.session);
      const body = partyListResponseSchema.parse(response.body);
      return { data: body.data, next: body.next_cursor };
    };
    const first = await page('limit=2');
    expect(first.data.map((row) => row.id)).toEqual([ids[2], ids[1]]);
    const second = await page(`limit=2&cursor=${first.next ?? ''}`);
    expect(second.data.map((row) => row.id)).toEqual([ids[0]]);
    expect((await page('role=supplier')).data.map((row) => row.id)).toEqual([ids[0]]);
    expect((await page('status=blocked')).data).toEqual([]);
  });
});
