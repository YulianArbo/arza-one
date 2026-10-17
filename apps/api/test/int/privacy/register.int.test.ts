import {
  activityListResponseSchema,
  activitySchema,
  createdResponseSchema,
  processorSchema,
} from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import type { Person } from '../iam/support/access-scenario.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import { PrivacyScenario } from './support/privacy-scenario.js';

// Registro de actividades de tratamiento y encargados (B17; Ley 1581, arts. 4, 17, 18 y 26).

const scenario = new PrivacyScenario('registro de tratamiento');

const ACTIVITY = {
  name: 'Gestión de clientes',
  purpose: 'Atender la relación comercial y contractual con los clientes',
  data_categories: ['identification', 'contact'],
  holder_types: ['customers'],
  legal_basis: 'Autorización del titular (Ley 1581, art. 9)',
  retention: 'Diez años después de terminada la relación',
};

async function processor(officer: Person, body: object = {}): Promise<string> {
  const sales = await scenario.sales();
  const partyId = await scenario.organization(sales);
  const response = await scenario.post('/v1/processors', officer.session, {
    party_id: partyId,
    service: 'Correo transaccional',
    country: 'us',
    review_on: '2027-01-31',
    ...body,
  });
  expect(response.status, response.text).toBe(201);
  return createdResponseSchema.parse(response.body).id;
}

describe('encargados', () => {
  it('sin contrato de transmisión queda con la alerta y se edita con la versión vista', async () => {
    const officer = await scenario.officer();
    const id = await processor(officer);
    const created = processorSchema.parse(
      (await scenario.get(`/v1/processors/${id}`, officer.session)).body,
    );
    expect(created).toMatchObject({ country: 'US', has_contract: false, status: 'active' });
    expect(created.party.name).not.toBeNull();
    const edit = {
      service: 'Correo y SMS',
      country: 'CO',
      review_on: '2027-06-30',
      status: 'inactive',
    };
    const saved = await scenario.patch(
      `/v1/processors/${id}`,
      officer.session,
      edit,
      created.version,
    );
    expect(saved.status, saved.text).toBe(200);
    expect(processorSchema.parse(saved.body)).toMatchObject({
      service: 'Correo y SMS',
      status: 'inactive',
    });
    const stale = await scenario.patch(
      `/v1/processors/${id}`,
      officer.session,
      edit,
      created.version,
    );
    expect(errorCode(stale)).toBe('VERSION_CONFLICT');
    expect(await scenario.actionsBy(officer)).toEqual(
      expect.arrayContaining(['privacy.processor.create', 'privacy.processor.update']),
    );
  });
});

describe('encargados', () => {
  it('el encargado es una organización y el contrato, un archivo propio revisado', async () => {
    const officer = await scenario.officer();
    const sales = await scenario.sales();
    const person = await scenario.party(sales, await scenario.personWithConsent());
    const base = { service: 'Nube', country: 'US', review_on: '2027-01-31' };
    const asPerson = await scenario.post('/v1/processors', officer.session, {
      ...base,
      party_id: person,
    });
    expect(errorCode(asPerson)).toBe('PRIVACY_PROCESSOR_INVALID');
    const org = await scenario.organization(sales);
    const foreignFile = await scenario.post('/v1/processors', officer.session, {
      ...base,
      party_id: org,
      contract_file_id: '019a0000-0000-7000-8000-0000000000dd',
    });
    expect(errorCode(foreignFile)).toBe('PRIVACY_EVIDENCE_INVALID');
  });
});

describe('actividades de tratamiento', () => {
  it('registra la actividad con sus encargados, que se pueden quitar y volver a poner', async () => {
    const officer = await scenario.officer();
    const [first, second] = [await processor(officer), await processor(officer)];
    const response = await scenario.post('/v1/processing-activities', officer.session, {
      ...ACTIVITY,
      processor_ids: [first, second],
    });
    expect(response.status, response.text).toBe(201);
    const id = createdResponseSchema.parse(response.body).id;
    const path = `/v1/processing-activities/${id}`;
    const created = activitySchema.parse((await scenario.get(path, officer.session)).body);
    expect(created.processors.map((row) => row.id).sort()).toEqual([first, second].sort());
    expect(created.sensitive).toBe(false);
    const edit = {
      ...ACTIVITY,
      data_categories: ['contact', 'health'],
      processor_ids: [second],
      status: 'active',
    };
    const narrowed = await scenario.patch(path, officer.session, edit, created.version);
    expect(activitySchema.parse(narrowed.body)).toMatchObject({
      sensitive: true,
      processors: [{ id: second }],
    });
    const back = { ...edit, processor_ids: [first, second] };
    const restored = await scenario.patch(path, officer.session, back, created.version + 1);
    expect(activitySchema.parse(restored.body).processors).toHaveLength(2);
    const list = activityListResponseSchema.parse(
      (await scenario.get('/v1/processing-activities', officer.session)).body,
    );
    expect(list.data.map((row) => row.id)).toContain(id);
  });
});

describe('actividades de tratamiento', () => {
  it('no acepta encargados que no existen', async () => {
    const officer = await scenario.officer();
    const response = await scenario.post('/v1/processing-activities', officer.session, {
      ...ACTIVITY,
      processor_ids: ['019a0000-0000-7000-8000-0000000000ee'],
    });
    expect(errorCode(response)).toBe('PRIVACY_PROCESSOR_INVALID');
    const missing = await scenario.get(
      '/v1/processing-activities/019a0000-0000-7000-8000-0000000000ee',
      officer.session,
    );
    expect(errorCode(missing)).toBe('PRIVACY_ACTIVITY_NOT_FOUND');
  });
});
