import { fileListResponseSchema } from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { FileScenario, pdfFile } from './support/file-scenario.js';

// Permiso denegado, aislamiento entre empresas y registro de accesos de los archivos (B14,
// capítulo 21 y numeral 15.5).

const scenario = new FileScenario('archivos acceso');

describe('permiso denegado', () => {
  it('un usuario sin permiso no obtiene el enlace de descarga ni el de subida', async () => {
    const owner = await scenario.uploader();
    const { id } = await scenario.upload(owner, pdfFile());
    const people = [
      await scenario.person('sin-rol', []),
      await scenario.person('portal', ['CLIENTE_ADMIN'], { kind: 'portal' }),
    ];
    for (const person of people) {
      expect(errorCode(await scenario.post(`/v1/files/${id}/download-link`, person.session))).toBe(
        'PERMISSION_DENIED',
      );
      expect(errorCode(await scenario.post('/v1/files', person.session, {}))).toBe(
        'PERMISSION_DENIED',
      );
      expect(errorCode(await scenario.get('/v1/files', person.session))).toBe('PERMISSION_DENIED');
    }
  });

  it('dirección y el colaborador leen pero no suben archivos', async () => {
    for (const roles of [['DIRECCION'], ['COLABORADOR']] as const) {
      const person = await scenario.person('lector', roles);
      const response = await scenario.post('/v1/files', person.session, {
        file_name: 'acta.pdf',
        mime_type: 'application/pdf',
        size_bytes: 10,
      });
      expect(errorCode(response)).toBe('PERMISSION_DENIED');
    }
  });
});

describe('permiso denegado: solo lo propio', () => {
  it('quien solo ve lo propio no ve ni descarga los archivos de otros', async () => {
    const owner = await scenario.uploader();
    const { id } = await scenario.upload(owner, pdfFile());
    const collaborator = await scenario.person('colaborador', ['COLABORADOR']);
    const list = fileListResponseSchema.parse(
      (await scenario.get('/v1/files', collaborator.session)).body,
    );
    expect(list.data.map((file) => file.id)).not.toContain(id);
    expect(errorCode(await scenario.get(`/v1/files/${id}`, collaborator.session))).toBe(
      'FILE_NOT_FOUND',
    );
    expect(
      errorCode(await scenario.post(`/v1/files/${id}/download-link`, collaborator.session)),
    ).toBe('FILE_NOT_FOUND');
  });

  it('dirección (lectura de todo) sí obtiene el enlace', async () => {
    const owner = await scenario.uploader();
    const { id } = await scenario.upload(owner, pdfFile());
    const director = await scenario.person('direccion', ['DIRECCION']);
    const link = await scenario.downloadLink(director, id);
    expect((await scenario.fetchLink(link.url)).status).toBe(200);
  });
});

describe('aislamiento entre empresas', () => {
  it('la empresa B no ve, ni lista, ni obtiene enlaces de los archivos de la empresa A', async () => {
    const owner = await scenario.uploader();
    const { id } = await scenario.upload(owner, pdfFile());
    const other = await scenario.uploader(scenario.otherTenant.id);
    expect(errorCode(await scenario.get(`/v1/files/${id}`, other.session))).toBe('FILE_NOT_FOUND');
    expect(errorCode(await scenario.post(`/v1/files/${id}/download-link`, other.session))).toBe(
      'FILE_NOT_FOUND',
    );
    const list = fileListResponseSchema.parse(
      (await scenario.get('/v1/files', other.session)).body,
    );
    expect(list.data.map((file) => file.id)).not.toContain(id);
  });

  it('cada empresa guarda sus archivos aparte en el almacenamiento', async () => {
    const owner = await scenario.uploader();
    const { id } = await scenario.upload(owner, pdfFile());
    const stored = await scenario.inTenant((tx) => tx.file.findUniqueOrThrow({ where: { id } }));
    expect(stored.storageKey).toBe(`${scenario.tenant.id}/${id}`);
  });

  it('un archivo inexistente responde igual que uno ajeno', async () => {
    const person = await scenario.uploader();
    expect(errorCode(await scenario.get(`/v1/files/${uuidv7()}`, person.session))).toBe(
      'FILE_NOT_FOUND',
    );
  });
});

describe('registro de accesos (auditoría)', () => {
  it('deja quién pidió el enlace, quién descargó y el resultado del análisis', async () => {
    const owner = await scenario.uploader();
    const { id } = await scenario.upload(owner, pdfFile());
    const link = await scenario.downloadLink(owner, id);
    await scenario.fetchLink(link.url);
    const events = await scenario.inTenant((tx) =>
      tx.auditEvent.findMany({ where: { entityId: id } }),
    );
    // El reloj de la prueba no avanza: todos llevan la misma hora, así que se compara sin orden.
    const actions = events.map((event) => [event.action, event.actorKind, event.actorId]);
    expect(actions.sort()).toEqual(
      [
        ['doc.file.create', 'user', owner.id],
        ['doc.file.upload', 'user', owner.id],
        ['doc.file.scan', 'system', null],
        ['doc.file.download_link', 'user', owner.id],
        ['doc.file.download', 'user', owner.id],
      ].sort(),
    );
    // La llave del enlace nunca queda en la auditoría.
    const token = new URL(link.url).pathname.split('/').at(-1) ?? '';
    expect(JSON.stringify(events.map((event) => event.changes))).not.toContain(token);
  });
});
