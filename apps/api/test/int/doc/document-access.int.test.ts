import { documentListResponseSchema } from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { beforeAll, describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { DocScenario } from './support/doc-scenario.js';

// Permiso denegado, «lo propio» y aislamiento entre empresas de los documentos (B18, capítulo 21
// y numeral 15.4).

const scenario = new DocScenario('documentos acceso');

beforeAll(async () => {
  await scenario.seed();
});

async function visibleCodes(session: Parameters<DocScenario['get']>[1]): Promise<string[]> {
  const response = await scenario.get('/v1/documents?limit=100', session);
  expect(response.status, response.text).toBe(200);
  return documentListResponseSchema.parse(response.body).data.map((doc) => doc.id);
}

describe('permiso denegado', () => {
  it('sin rol o desde el portal no se ven documentos, carpetas ni versiones', async () => {
    const author = await scenario.quality();
    const id = await scenario.createDocument(author);
    const version = await scenario.latest(author, id);
    const people = [
      await scenario.person('sin-rol', []),
      await scenario.person('portal', ['CLIENTE_ADMIN'], { kind: 'portal' }),
    ];
    for (const person of people) {
      for (const path of ['/v1/documents', '/v1/folders', `/v1/documents/${id}/versions`]) {
        expect(errorCode(await scenario.get(path, person.session))).toBe('PERMISSION_DENIED');
      }
      const link = scenario.post(`/v1/versions/${version.id}/download-link`, person.session);
      expect(errorCode(await link)).toBe('PERMISSION_DENIED');
    }
  });

  it('dirección y el colaborador no crean documentos ni carpetas', async () => {
    for (const roles of [['DIRECCION'], ['COLABORADOR']] as const) {
      const person = await scenario.person('lector', roles);
      expect(errorCode(await scenario.post('/v1/documents', person.session, {}))).toBe(
        'PERMISSION_DENIED',
      );
      expect(errorCode(await scenario.post('/v1/folders', person.session, {}))).toBe(
        'PERMISSION_DENIED',
      );
    }
  });

  it('comercial crea y envía, pero no aprueba ni publica', async () => {
    const sales = await scenario.person('comercial', ['COMERCIAL']);
    const id = await scenario.createDocument(sales);
    const sent = await scenario.step(sales, await scenario.latest(sales, id), 'submit');
    expect(sent.status, sent.text).toBe(204);
    const other = await scenario.person('comercial-2', ['COMERCIAL']);
    const inReview = await scenario.latest(other, id);
    expect(errorCode(await scenario.step(other, inReview, 'approve'))).toBe('PERMISSION_DENIED');
    expect(errorCode(await scenario.step(other, inReview, 'publish'))).toBe('PERMISSION_DENIED');
  });
});

describe('permiso denegado: lo propio del colaborador', () => {
  it('ve los vigentes de su proceso y nunca los borradores ajenos', async () => {
    const author = await scenario.quality('elabora');
    const approver = await scenario.quality('aprueba');
    const published = await scenario.createDocument(author);
    await scenario.publishLatest(author, approver, published);
    const draft = await scenario.createDocument(author);
    const otherProcess = await scenario.createDocument(author, {
      folder_id: await scenario.folderId('SGC-COM'),
      process_id: await scenario.processId('COM'),
    });
    await scenario.publishLatest(author, approver, otherProcess);
    const collaborator = await scenario.person('colaborador', ['COLABORADOR']);
    await scenario.placeInProcess(collaborator.id, 'SGC');
    const visible = await visibleCodes(collaborator.session);
    expect(visible).toContain(published);
    expect(visible).not.toContain(draft);
    expect(visible).not.toContain(otherProcess);
    expect(errorCode(await scenario.get(`/v1/documents/${draft}`, collaborator.session))).toBe(
      'DOC_DOCUMENT_NOT_FOUND',
    );
  });
});

describe('permiso denegado: versiones del colaborador', () => {
  it('del vigente ajeno solo ve la versión vigente, sin el archivo fuente', async () => {
    const author = await scenario.quality('elabora');
    const approver = await scenario.quality('aprueba');
    const id = await scenario.createDocument(author);
    await scenario.publishLatest(author, approver, id);
    await scenario.newVersion(author, id);
    const collaborator = await scenario.person('colaborador', ['COLABORADOR']);
    await scenario.placeInProcess(collaborator.id, 'SGC');
    const versions = await scenario.versions(collaborator, id);
    expect(versions.map((v) => v.status)).toEqual(['current']);
    expect(versions[0]?.source_file).toBeNull();
    expect((await scenario.document(collaborator, id)).open_version).toBeNull();
    const source = scenario.post(
      `/v1/versions/${versions[0]?.id ?? ''}/download-link`,
      collaborator.session,
      {
        file: 'source',
      },
    );
    expect(errorCode(await source)).toBe('PERMISSION_DENIED');
  });
});

describe('aislamiento entre empresas', () => {
  it('la empresa B no ve, ni lista, ni descarga los documentos de la empresa A', async () => {
    const author = await scenario.quality();
    const id = await scenario.createDocument(author);
    const version = await scenario.latest(author, id);
    const other = await scenario.quality('calidad-b', scenario.otherTenant.id);
    expect(errorCode(await scenario.get(`/v1/documents/${id}`, other.session))).toBe(
      'DOC_DOCUMENT_NOT_FOUND',
    );
    expect(await visibleCodes(other.session)).not.toContain(id);
    const link = scenario.post(`/v1/versions/${version.id}/download-link`, other.session);
    expect(errorCode(await link)).toBe('DOC_VERSION_NOT_FOUND');
    const folders = await scenario.folders(other);
    expect(folders.map((folder) => folder.id)).not.toContain(await scenario.folderId('SGC-SGC'));
  });

  it('la empresa B no crea documentos en las carpetas de la empresa A', async () => {
    const other = await scenario.quality('calidad-b', scenario.otherTenant.id);
    const body = await scenario.documentBody(other, {
      process_id: await scenario.processId('SGC', scenario.otherTenant.id),
    });
    const response = await scenario.post('/v1/documents', other.session, body);
    expect(errorCode(response)).toBe('DOC_FOLDER_NOT_FOUND');
  });

  it('cada empresa lleva su propio consecutivo PR-SGC', async () => {
    const other = await scenario.quality('calidad-b', scenario.otherTenant.id);
    const id = await scenario.createDocument(other, {
      folder_id: await scenario.folderId('SGC-SGC', scenario.otherTenant.id),
      process_id: await scenario.processId('SGC', scenario.otherTenant.id),
    });
    expect((await scenario.document(other, id)).code).toBe('PR-SGC-001');
  });

  it('un documento inexistente responde igual que uno ajeno', async () => {
    const person = await scenario.quality();
    expect(errorCode(await scenario.get(`/v1/documents/${uuidv7()}`, person.session))).toBe(
      'DOC_DOCUMENT_NOT_FOUND',
    );
  });
});
