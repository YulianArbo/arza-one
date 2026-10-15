import { contactListResponseSchema } from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { PartyScenario, organizationBody, personBody } from './support/party-scenario.js';

// Casos límite de terceros (B13): registros que no existen, revisiones fuera de orden, contactos
// que vuelven y fusión de dos personas.

const scenario = new PartyScenario('terceros limites');
const ACCOUNT = { bank: 'BANCOLOMBIA', account_type: 'savings', account_number: '11223344556' };
const MISSING = uuidv7();

describe('registros que no existen', () => {
  it('cuenta, conocimiento y contacto inexistentes responden 404', async () => {
    const finance = await scenario.finance();
    const director = await scenario.person('director', ['DIRECCION']);
    const id = await scenario.party(finance);
    const calls = [
      scenario.post(`/v1/parties/${id}/bank-accounts/${MISSING}/actions/approve`, finance.session),
      scenario.post(`/v1/parties/${id}/due-diligence/${MISSING}/actions/reject`, director.session, {
        note: 'No existe',
      }),
      scenario.patch(`/v1/parties/${id}/contacts/${MISSING}`, finance.session, {}, 1),
      scenario.delete(`/v1/parties/${id}/contacts/${MISSING}`, finance.session, 1),
    ];
    for (const response of await Promise.all(calls)) {
      expect(errorCode(response)).toBe('PARTY_NOT_FOUND');
    }
  });

  it('solo se reemplaza una cuenta aprobada', async () => {
    const finance = await scenario.finance();
    const id = await scenario.party(finance);
    const pending = await scenario.create(`/v1/parties/${id}/bank-accounts`, finance, ACCOUNT);
    const response = await scenario.post(`/v1/parties/${id}/bank-accounts`, finance.session, {
      ...ACCOUNT,
      replaces_id: pending,
    });
    expect(errorCode(response)).toBe('PARTY_NOT_FOUND');
  });
});

describe('contactos que cambian', () => {
  it('una persona no tiene contactos y un contacto retirado vuelve con su misma ficha', async () => {
    const sales = await scenario.sales();
    const org = await scenario.party(sales);
    const person = await scenario.party(sales, personBody());
    const asPerson = await scenario.post(`/v1/parties/${person}/contacts`, sales.session, {
      person_id: person,
    });
    expect(errorCode(asPerson)).toBe('PARTY_CONTACT_INVALID');
    const path = `/v1/parties/${org}/contacts`;
    const first = await scenario.create(path, sales, { person_id: person });
    expect((await scenario.delete(`${path}/${first}`, sales.session, 1)).status).toBe(204);
    const again = await scenario.create(path, sales, { person_id: person, is_primary: true });
    expect(again).toBe(first);
    const stale = { job_title: 'Gerente', is_primary: true, can_sign: false };
    expect(errorCode(await scenario.patch(`${path}/${first}`, sales.session, stale, 1))).toBe(
      'VERSION_CONFLICT',
    );
    expect(errorCode(await scenario.delete(`${path}/${first}`, sales.session, 1))).toBe(
      'VERSION_CONFLICT',
    );
  });
});

describe('fusión de dos personas', () => {
  it('la persona que se conserva queda como contacto de la organización', async () => {
    const sales = await scenario.sales();
    const org = await scenario.party(sales, organizationBody());
    const keep = await scenario.party(sales, personBody());
    const duplicate = await scenario.party(sales, personBody());
    await scenario.create(`/v1/parties/${org}/contacts`, sales, {
      person_id: duplicate,
      is_primary: true,
    });
    const merge = await scenario.post(`/v1/parties/${keep}/merge`, sales.session, {
      duplicate_id: duplicate,
    });
    expect(merge.status, merge.text).toBe(204);
    const response = await scenario.get(`/v1/parties/${org}/contacts`, sales.session);
    const contacts = contactListResponseSchema.parse(response.body).data;
    expect(contacts.map((row) => [row.person.id, row.is_primary])).toEqual([[keep, true]]);
  });
});
