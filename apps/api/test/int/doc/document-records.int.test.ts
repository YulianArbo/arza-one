import { Readable } from 'node:stream';

import { createdResponseSchema, downloadLinkResponseSchema } from '@arza/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import type { Person } from '../iam/support/access-scenario.js';
import { DocScenario } from './support/doc-scenario.js';
import { storage } from './support/file-scenario.js';

// Auditoría, registro de accesos, documentos restringidos y huella de integridad (B18, ficha
// 17.4: «alterar un archivo en el almacenamiento hace fallar la verificación de su huella»).

const scenario = new DocScenario('documentos registros');

beforeAll(async () => {
  await scenario.seed();
});

async function auditActions(entityIds: readonly string[]): Promise<string[]> {
  const events = await scenario.inTenant((tx) =>
    tx.auditEvent.findMany({ where: { entityId: { in: [...entityIds] } } }),
  );
  return events.map((event) => event.action).sort();
}

/** Persona con el permiso nominal «Ver documentos restringidos», además de Calidad. */
async function restrictedReader(admin: Person): Promise<Person> {
  const reader = await scenario.quality('restringidos');
  const role = await scenario.post('/v1/roles', admin.session, {
    name: `Restringidos ${reader.id.slice(-6)}`,
    audience: 'internal',
    permissions: [{ code: 'doc.restricted.read', scope: 'all' }],
  });
  expect(role.status, role.text).toBe(201);
  const roleId = createdResponseSchema.parse(role.body).id;
  const assigned = await scenario.post(`/v1/users/${reader.id}/roles`, admin.session, {
    role_id: roleId,
  });
  expect(assigned.status, assigned.text).toBe(201);
  return scenario.refresh(reader);
}

describe('auditoría del ciclo', () => {
  it('cada paso deja su evento', async () => {
    const author = await scenario.quality('elabora');
    const approver = await scenario.quality('aprueba');
    const id = await scenario.createDocument(author);
    const current = await scenario.publishLatest(author, approver, id);
    expect(await auditActions([id, current.id])).toEqual(
      [
        'doc.document.create',
        'doc.version.create',
        'doc.version.submit',
        // Desde B19: la revisión de Calidad antes de la aprobación de Dirección.
        'doc.version.review',
        'doc.version.approve',
        'doc.version.publish',
      ].sort(),
    );
  });
});

describe('registro de accesos', () => {
  it('la descarga de un documento confidencial queda en doc_access_log', async () => {
    const author = await scenario.quality('elabora');
    const id = await scenario.createDocument(author, { classification: 'confidential' });
    const version = await scenario.latest(author, id);
    const response = await scenario.post(
      `/v1/versions/${version.id}/download-link`,
      author.session,
    );
    expect(response.status, response.text).toBe(200);
    const link = downloadLinkResponseSchema.parse(response.body);
    expect((await scenario.fetchLink(link.url)).status).toBe(200);
    const log = await scenario.inTenant((tx) =>
      tx.docAccessLog.findMany({ where: { documentId: id } }),
    );
    expect(log.map((row) => [row.action, row.userId, row.versionId])).toEqual([
      ['download', author.id, version.id],
    ]);
  });

  it('lo interno no va al registro de accesos', async () => {
    const author = await scenario.quality('elabora');
    const id = await scenario.createDocument(author);
    const version = await scenario.latest(author, id);
    await scenario.post(`/v1/versions/${version.id}/download-link`, author.session);
    const count = await scenario.inTenant((tx) =>
      tx.docAccessLog.count({ where: { documentId: id } }),
    );
    expect(count).toBe(0);
  });
});

describe('documentos restringidos', () => {
  it('exigen el permiso nominal además del rol, y cada consulta queda registrada', async () => {
    const author = await scenario.quality('elabora');
    const admin = await scenario.person('admin', ['ADMIN_PLATAFORMA']);
    const reader = await restrictedReader(admin);
    const id = await scenario.createDocument(reader, { classification: 'restricted' });
    expect(errorCode(await scenario.get(`/v1/documents/${id}`, author.session))).toBe(
      'DOC_DOCUMENT_NOT_FOUND',
    );
    const director = await scenario.person('direccion', ['DIRECCION']);
    expect(errorCode(await scenario.get(`/v1/documents/${id}`, director.session))).toBe(
      'DOC_DOCUMENT_NOT_FOUND',
    );
    expect((await scenario.document(reader, id)).classification).toBe('restricted');
    const log = await scenario.inTenant((tx) =>
      tx.docAccessLog.findMany({ where: { documentId: id } }),
    );
    expect(log.map((row) => [row.action, row.userId])).toEqual([['view', reader.id]]);
    expect(await auditActions([id])).toContain('doc.document.view');
  });
});

describe('huella de integridad', () => {
  it('alterar el archivo guardado hace fallar la descarga y deja la alerta', async () => {
    const author = await scenario.quality('elabora');
    const id = await scenario.createDocument(author);
    const version = await scenario.latest(author, id);
    const file = await scenario.inTenant((tx) =>
      tx.file.findUniqueOrThrow({ where: { id: version.pdf_file?.id ?? '' } }),
    );
    const altered = Buffer.from('%PDF-1.7\n% alterado\n%%EOF\n');
    await storage().put(
      { key: file.storageKey, contentType: 'application/pdf', sizeBytes: altered.length },
      Readable.from(altered),
    );
    const response = await scenario.post(
      `/v1/versions/${version.id}/download-link`,
      author.session,
    );
    expect(errorCode(response)).toBe('DOC_INTEGRITY_FAILED');
    const alerts = await scenario.inTenant((tx) =>
      tx.securityEvent.findMany({
        where: { type: 'doc.file.integrity_failed', userId: author.id },
      }),
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.severity).toBe('high');
  });
});
