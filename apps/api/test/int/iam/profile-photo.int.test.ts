import { meResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { pdfFile } from '../doc/support/file-scenario.js';
import { getImage, putJson, remove, samplePng, uploadImage } from '../support/image-steps.js';
import { AccessScenario } from './support/access-scenario.js';
import { auditActions, errorCode } from './support/iam-fixtures.js';

// Foto de perfil (B22A): cada persona cambia la suya, con una imagen propia revisada; nadie usa la
// imagen de otra persona ni de otra empresa, y cada cambio queda en la auditoría.

const scenario = new AccessScenario('foto de perfil');
const UPLOADS = '/v1/me/photo/uploads';

async function hasPhoto(session: Parameters<typeof scenario.get>[1]): Promise<boolean> {
  return meResponseSchema.parse((await scenario.get('/v1/me', session)).body).has_photo;
}

describe('foto de perfil', () => {
  it('la persona sube, ve y quita su foto, y cada cambio queda auditado', async () => {
    const ana = await scenario.person('ana', ['COLABORADOR']);
    const fileId = await uploadImage(scenario, ana, UPLOADS);
    expect((await putJson(scenario, '/v1/me/photo', ana.session, { file_id: fileId })).status).toBe(
      204,
    );
    expect(await hasPhoto(ana.session)).toBe(true);
    const image = await getImage(scenario, '/v1/me/photo', ana.session);
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.headers['cache-control']).toBe('private, no-cache');
    expect(Buffer.compare(image.body as Buffer, samplePng().content)).toBe(0);
    expect((await remove(scenario, '/v1/me/photo', ana.session)).status).toBe(204);
    expect(await hasPhoto(ana.session)).toBe(false);
    expect(errorCode(await scenario.get('/v1/me/photo', ana.session))).toBe('IMAGE_NOT_FOUND');
    expect(await auditActions(scenario.db, scenario.tenant.id, ana.id)).toEqual(
      expect.arrayContaining(['iam.user.photo_update:success', 'iam.user.photo_remove:success']),
    );
  });

  it('una persona del portal también tiene foto', async () => {
    const client = await scenario.person('cliente', ['CLIENTE_ADMIN'], { kind: 'portal' });
    const fileId = await uploadImage(scenario, client, UPLOADS);
    const response = await putJson(scenario, '/v1/me/photo', client.session, { file_id: fileId });
    expect(response.status, response.text).toBe(204);
  });

  it('solo acepta PNG o JPG de hasta 2 MB al pedir el enlace', async () => {
    const ana = await scenario.person('ana-tipos', ['COLABORADOR']);
    const pdf = { file_name: 'Informe.pdf', mime_type: 'application/pdf', size_bytes: 100 };
    expect((await scenario.post(UPLOADS, ana.session, pdf)).status).toBe(422);
    const heavy = { file_name: 'Foto.png', mime_type: 'image/png', size_bytes: 3_000_000 };
    expect((await scenario.post(UPLOADS, ana.session, heavy)).status).toBe(422);
  });
});

describe('foto de perfil: antivirus', () => {
  it('mientras el antivirus revisa la imagen, pide esperar y no la usa', async () => {
    const ana = await scenario.person('ana-espera', ['COLABORADOR']);
    const fileId = await uploadImage(scenario, ana, UPLOADS, { scan: false });
    const early = await putJson(scenario, '/v1/me/photo', ana.session, { file_id: fileId });
    expect(errorCode(early)).toBe('IMAGE_SCANNING');
    expect(await hasPhoto(ana.session)).toBe(false);
  });
});

describe('foto de perfil: permiso y aislamiento', () => {
  it('nadie usa como foto la imagen que subió otra persona', async () => {
    const ana = await scenario.person('ana-ajena', ['COLABORADOR']);
    const luis = await scenario.person('luis', ['COLABORADOR']);
    const fileId = await uploadImage(scenario, luis, UPLOADS);
    const response = await putJson(scenario, '/v1/me/photo', ana.session, { file_id: fileId });
    expect(errorCode(response)).toBe('IMAGE_INVALID');
  });

  it('nadie usa como foto una imagen de otra empresa', async () => {
    const ana = await scenario.person('ana-empresa', ['COLABORADOR']);
    const other = await scenario.person('otra', ['COLABORADOR'], {
      tenantId: scenario.otherTenant.id,
    });
    const fileId = await uploadImage(scenario, other, UPLOADS, {
      tenantId: scenario.otherTenant.id,
    });
    const response = await putJson(scenario, '/v1/me/photo', ana.session, { file_id: fileId });
    expect(errorCode(response)).toBe('IMAGE_INVALID');
  });

  it('un archivo propio que no es imagen no sirve como foto', async () => {
    const quality = await scenario.person('calidad', ['CALIDAD']);
    const fileId = await uploadImage(scenario, quality, '/v1/files', { file: pdfFile() });
    const response = await putJson(scenario, '/v1/me/photo', quality.session, { file_id: fileId });
    expect(errorCode(response)).toBe('IMAGE_INVALID');
  });
});
