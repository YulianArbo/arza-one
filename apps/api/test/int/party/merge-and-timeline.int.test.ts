import {
  contactListResponseSchema,
  partySearchResponseSchema,
  timelineResponseSchema,
} from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import type { Person } from '../iam/support/access-scenario.js';
import { PartyScenario, organizationBody, personBody } from './support/party-scenario.js';

// Contactos, fusión de duplicados y línea de tiempo (B13, ficha 17.3).

const scenario = new PartyScenario('fusion');
const ACCOUNT = { bank: 'BOGOTA', account_type: 'checking', account_number: '987654321' };

async function contacts(person: Person, partyId: string) {
  const response = await scenario.get(`/v1/parties/${partyId}/contacts`, person.session);
  return contactListResponseSchema.parse(response.body).data;
}

async function timeline(person: Person, partyId: string) {
  const response = await scenario.get(`/v1/parties/${partyId}/timeline?limit=100`, person.session);
  expect(response.status, response.text).toBe(200);
  return timelineResponseSchema.parse(response.body).data.map((entry) => entry.action);
}

describe('contactos y firmantes', () => {
  it('una organización tiene un solo contacto principal y la persona ve dónde es contacto', async () => {
    const sales = await scenario.sales();
    const org = await scenario.party(sales);
    const [ana, luis] = [
      await scenario.party(sales, personBody()),
      await scenario.party(sales, personBody()),
    ];
    const path = `/v1/parties/${org}/contacts`;
    await scenario.create(path, sales, { person_id: ana, is_primary: true, can_sign: true });
    const second = await scenario.create(path, sales, { person_id: luis, is_primary: true });
    const list = await contacts(sales, org);
    expect(list.map((row) => [row.person.id, row.is_primary])).toEqual([
      [luis, true],
      [ana, false],
    ]);
    expect((await contacts(sales, ana)).map((row) => row.organization.id)).toEqual([org]);
    const repeated = await scenario.post(path, sales.session, { person_id: ana });
    expect(errorCode(repeated)).toBe('PARTY_CONTACT_INVALID');
    const orgAsPerson = await scenario.post(path, sales.session, { person_id: org });
    expect(errorCode(orgAsPerson)).toBe('PARTY_CONTACT_INVALID');
    expect((await scenario.delete(`${path}/${second}`, sales.session, 1)).status).toBe(204);
    expect((await contacts(sales, org)).map((row) => row.person.id)).toEqual([ana]);
  });
});

describe('fusión de duplicados', () => {
  it('pasa todo al que se conserva, conserva el historial de ambos y queda auditada', async () => {
    const finance = await scenario.finance();
    const keep = await scenario.party(finance, organizationBody({ roles: ['customer'] }));
    const duplicateBody = organizationBody({ roles: ['customer', 'supplier'] });
    const duplicate = await scenario.party(finance, duplicateBody);
    const person = await scenario.party(finance, personBody());
    await scenario.create(`/v1/parties/${duplicate}/contacts`, finance, { person_id: person });
    await scenario.create(`/v1/parties/${duplicate}/bank-accounts`, finance, ACCOUNT);
    const merge = await scenario.post(`/v1/parties/${keep}/merge`, finance.session, {
      duplicate_id: duplicate,
    });
    expect(merge.status, merge.text).toBe(204);
    const kept = await scenario.detail(finance, keep);
    expect(kept.roles.sort()).toEqual(['customer', 'supplier']);
    expect((await contacts(finance, keep)).map((row) => row.person.id)).toEqual([person]);
    const accounts = await scenario.get(`/v1/parties/${keep}/bank-accounts`, finance.session);
    expect(JSON.stringify(accounts.body)).toContain('•••• 4321');
    expect(errorCode(await scenario.get(`/v1/parties/${duplicate}`, finance.session))).toBe(
      'PARTY_NOT_FOUND',
    );
    const actions = await timeline(finance, keep);
    expect(actions[0]).toBe('party.merge');
    // El historial del duplicado sigue a la vista: su creación y su cuenta bancaria.
    expect(actions.filter((action) => action === 'party.create')).toHaveLength(2);
    expect(actions).toContain('party.bank_account.create');
    const outbox = await scenario.inTenant((tx) =>
      tx.outboxEvent.findMany({ where: { eventType: 'party.merged' } }),
    );
    expect(outbox.map((event) => event.payload)).toContainEqual({
      survivor_id: keep,
      duplicate_id: duplicate,
    });
  });
});

describe('fusión de duplicados: reglas', () => {
  it('el documento del duplicado lleva al tercero que se conservó', async () => {
    const sales = await scenario.sales();
    const keep = await scenario.party(sales);
    const duplicateBody = organizationBody();
    const duplicate = await scenario.party(sales, duplicateBody);
    await scenario.post(`/v1/parties/${keep}/merge`, sales.session, { duplicate_id: duplicate });
    const again = await scenario.post('/v1/parties', sales.session, duplicateBody);
    expect(errorCode(again)).toBe('PARTY_DUPLICATE');
    const search = await scenario.get(
      `/v1/parties/search?id_number=${String(duplicateBody.id_number)}`,
      sales.session,
    );
    const found = partySearchResponseSchema.parse(search.body).data;
    expect(found.map((row) => row.party.id)).toEqual([keep]);
  });

  it('no fusiona un tercero consigo mismo ni una persona con una organización', async () => {
    const sales = await scenario.sales();
    const org = await scenario.party(sales);
    const person = await scenario.party(sales, personBody());
    for (const duplicate of [org, person]) {
      const response = await scenario.post(`/v1/parties/${org}/merge`, sales.session, {
        duplicate_id: duplicate,
      });
      expect(errorCode(response)).toBe('PARTY_MERGE_INVALID');
    }
  });
});

describe('línea de tiempo según el rol', () => {
  it('quien no puede ver cuentas bancarias tampoco ve sus movimientos', async () => {
    const finance = await scenario.finance();
    const sales = await scenario.sales();
    const id = await scenario.party(finance);
    await scenario.create(`/v1/parties/${id}/bank-accounts`, finance, ACCOUNT);
    expect(await timeline(finance, id)).toEqual(['party.bank_account.create', 'party.create']);
    expect(await timeline(sales, id)).toEqual(['party.create']);
  });
});
