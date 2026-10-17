import { createdResponseSchema, documentLinkListResponseSchema } from '@arza/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

import { seedDocFolders } from '../../../src/modules/doc/index.js';
import { apiDatabase } from '../support/integration-database.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import type { Person } from '../iam/support/access-scenario.js';
import { organizationBody } from '../party/support/party-scenario.js';
import { DocScenario } from './support/doc-scenario.js';

// Explorador de expedientes y vínculos de los documentos (B18; ficha 17.4 y numeral 18.2).

const scenario = new DocScenario('expedientes');

beforeAll(async () => {
  await scenario.seed();
});

/** Un tercero registrado por comercial, con su nombre. */
async function registeredParty(): Promise<{ id: string; name: string }> {
  const sales = await scenario.person('comercial', ['COMERCIAL']);
  const body = organizationBody();
  const response = await scenario.post('/v1/parties', sales.session, body);
  expect(response.status, response.text).toBe(201);
  return { id: createdResponseSchema.parse(response.body).id, name: String(body['legal_name']) };
}

async function party(): Promise<string> {
  return (await registeredParty()).id;
}

async function caseFile(person: Person, partyId: string) {
  return scenario.post('/v1/folders', person.session, {
    parent_id: await scenario.folderId('EXP'),
    name: 'Cliente de prueba',
    kind: 'case_file',
    entity_type: 'party',
    entity_id: partyId,
  });
}

async function links(person: Person, documentId: string) {
  const response = await scenario.get(`/v1/documents/${documentId}/links`, person.session);
  expect(response.status, response.text).toBe(200);
  return documentLinkListResponseSchema.parse(response.body).data;
}

describe('carpetas iniciales', () => {
  it('el SGC con una carpeta por proceso, y los expedientes', async () => {
    const person = await scenario.quality();
    const codes = (await scenario.folders(person)).map((folder) => folder.code);
    expect(codes).toEqual(expect.arrayContaining(['SGC', 'SGC-SGC', 'SGC-COM', 'EXP']));
  });

  it('sembrar de nuevo no duplica nada', async () => {
    const before = (await scenario.folders(await scenario.quality())).length;
    await seedDocFolders(apiDatabase(), [scenario.tenant.id], scenario.clock);
    expect((await scenario.folders(await scenario.quality())).length).toBe(before);
  });
});

describe('expedientes de terceros', () => {
  it('un tercero tiene un solo expediente, con su nombre', async () => {
    const person = await scenario.quality();
    const { id: partyId, name } = await registeredParty();
    const created = await caseFile(person, partyId);
    expect(created.status, created.text).toBe(201);
    const { id } = createdResponseSchema.parse(created.body);
    const folder = (await scenario.folders(person)).find((item) => item.id === id);
    expect(folder?.entity_name).toBe(name);
    expect(errorCode(await caseFile(person, partyId))).toBe('DOC_CASE_FILE_EXISTS');
  });

  it('un expediente no va dentro de otro ni es de un tercero inexistente', async () => {
    const person = await scenario.quality();
    const outer = createdResponseSchema.parse((await caseFile(person, await party())).body).id;
    const inner = await scenario.post('/v1/folders', person.session, {
      parent_id: outer,
      name: 'Dentro',
      kind: 'case_file',
      entity_type: 'party',
      entity_id: await party(),
    });
    expect(errorCode(inner)).toBe('DOC_FOLDER_INVALID');
    expect(errorCode(await caseFile(person, scenario.tenant.id))).toBe('DOC_FOLDER_INVALID');
  });

  it('renombrar una carpeta usa la versión vista', async () => {
    const person = await scenario.quality();
    const created = await scenario.post('/v1/folders', person.session, {
      parent_id: null,
      name: 'Actas',
    });
    const { id } = createdResponseSchema.parse(created.body);
    const body = { name: 'Actas de comité', classification: 'confidential' };
    expect((await scenario.patch(`/v1/folders/${id}`, person.session, body, 1)).status).toBe(204);
    expect(errorCode(await scenario.patch(`/v1/folders/${id}`, person.session, body, 1))).toBe(
      'VERSION_CONFLICT',
    );
  });
});

describe('vínculos del documento', () => {
  it('con un proceso y un tercero; retirar y volver a vincular', async () => {
    const person = await scenario.quality();
    const id = await scenario.createDocument(person);
    const process = await scenario.processId('COM');
    const { id: partyId, name } = await registeredParty();
    const toProcess = { entity_type: 'process', entity_id: process, relation: 'applies_to' };
    const toParty = { entity_type: 'party', entity_id: partyId, relation: 'supports' };
    const first = await scenario.post(`/v1/documents/${id}/links`, person.session, toProcess);
    expect(first.status, first.text).toBe(201);
    await scenario.post(`/v1/documents/${id}/links`, person.session, toParty);
    const names = (await links(person, id)).map((link) => link.entity_name);
    expect(names).toEqual(['COM · Gestión Comercial', name]);
    const linkId = createdResponseSchema.parse(first.body).id;
    const removed = await scenario.delete(`/v1/documents/${id}/links/${linkId}`, person.session);
    expect(removed.status, removed.text).toBe(204);
    expect(await links(person, id)).toHaveLength(1);
    await scenario.post(`/v1/documents/${id}/links`, person.session, toProcess);
    expect(await links(person, id)).toHaveLength(2);
  });

  it('un registro que no existe no se vincula', async () => {
    const person = await scenario.quality();
    const id = await scenario.createDocument(person);
    const body = { entity_type: 'position', entity_id: scenario.tenant.id, relation: 'related' };
    expect(errorCode(await scenario.post(`/v1/documents/${id}/links`, person.session, body))).toBe(
      'DOC_REFERENCE_INVALID',
    );
  });
});
