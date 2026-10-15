import { partyListResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { PartyScenario, organizationBody } from './support/party-scenario.js';

// Permiso denegado y aislamiento entre empresas de terceros (B13, capítulo 21 y numeral 15.5).

const scenario = new PartyScenario('terceros acceso');
const ACCOUNT = { bank: 'BBVA', account_type: 'savings', account_number: '11112222333' };

describe('permiso denegado', () => {
  it('un colaborador, SST y el portal no ven terceros', async () => {
    const people = [
      await scenario.person('colaborador', ['COLABORADOR']),
      await scenario.person('sst', ['SST']),
      await scenario.person('portal', ['CLIENTE_ADMIN'], { kind: 'portal' }),
    ];
    for (const person of people) {
      expect(errorCode(await scenario.get('/v1/parties', person.session))).toBe(
        'PERMISSION_DENIED',
      );
    }
  });

  it('comercial no ve, registra ni aprueba cuentas bancarias', async () => {
    const sales = await scenario.sales();
    const id = await scenario.party(sales);
    const calls = [
      scenario.get(`/v1/parties/${id}/bank-accounts`, sales.session),
      scenario.post(`/v1/parties/${id}/bank-accounts`, sales.session, ACCOUNT),
    ];
    for (const response of await Promise.all(calls)) {
      expect(errorCode(response)).toBe('PERMISSION_DENIED');
    }
  });
});

describe('permiso denegado: contador y equipo de proyecto', () => {
  it('el contador ve las cuentas pero no las registra, y solo lee los terceros', async () => {
    const finance = await scenario.finance();
    const accountant = await scenario.person('contador', ['CONTADOR']);
    const id = await scenario.party(finance);
    expect((await scenario.get(`/v1/parties/${id}/bank-accounts`, accountant.session)).status).toBe(
      200,
    );
    const writes = [
      scenario.post(`/v1/parties/${id}/bank-accounts`, accountant.session, ACCOUNT),
      scenario.post('/v1/parties', accountant.session, organizationBody()),
      scenario.post(`/v1/parties/${id}/merge`, accountant.session, { duplicate_id: id }),
    ];
    for (const response of await Promise.all(writes)) {
      expect(errorCode(response)).toBe('PERMISSION_DENIED');
    }
  });
});

describe('permiso denegado: solo lo propio', () => {
  it('el equipo de proyecto solo ve los terceros que registró', async () => {
    const sales = await scenario.sales();
    const team = await scenario.person('equipo', ['EQUIPO_PROYECTO']);
    const others = await scenario.party(sales);
    const own = await scenario.db.withTenant(
      { tenantId: scenario.tenant.id, userId: team.id },
      (tx) =>
        tx.party.create({
          data: {
            tenantId: scenario.tenant.id,
            kind: 'organization',
            legalName: 'Cliente del equipo',
            idType: 'CC',
            idNumber: `EQ${String(Date.now())}`,
          },
        }),
    );
    const list = partyListResponseSchema.parse(
      (await scenario.get('/v1/parties', team.session)).body,
    );
    expect(list.data.map((row) => row.id)).toEqual([own.id]);
    expect(errorCode(await scenario.get(`/v1/parties/${others}`, team.session))).toBe(
      'PARTY_NOT_FOUND',
    );
    expect(errorCode(await scenario.post('/v1/parties', team.session, organizationBody()))).toBe(
      'PERMISSION_DENIED',
    );
  });
});

describe('aislamiento entre empresas', () => {
  it('la empresa B no ve ni toca los terceros de la empresa A', async () => {
    const financeA = await scenario.finance();
    const financeB = await scenario.finance(scenario.otherTenant.id);
    const body = organizationBody();
    const id = await scenario.party(financeA, body);
    const listB = partyListResponseSchema.parse(
      (await scenario.get('/v1/parties', financeB.session)).body,
    );
    expect(listB.data.map((row) => row.id)).not.toContain(id);
    const reads = [
      `/v1/parties/${id}`,
      `/v1/parties/${id}/contacts`,
      `/v1/parties/${id}/bank-accounts`,
      `/v1/parties/${id}/due-diligence`,
      `/v1/parties/${id}/timeline`,
    ];
    for (const path of reads) {
      expect(errorCode(await scenario.get(path, financeB.session))).toBe('PARTY_NOT_FOUND');
    }
    const ownB = await scenario.party(financeB, body);
    const writes = [
      scenario.post(`/v1/parties/${id}/bank-accounts`, financeB.session, ACCOUNT),
      scenario.post(`/v1/parties/${ownB}/merge`, financeB.session, { duplicate_id: id }),
      scenario.post(`/v1/parties/${ownB}/contacts`, financeB.session, { person_id: id }),
    ];
    for (const response of await Promise.all(writes)) {
      expect(errorCode(response)).toBe('PARTY_NOT_FOUND');
    }
  });
});
