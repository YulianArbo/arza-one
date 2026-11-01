import { uploadLinkResponseSchema } from '@arza/contracts';
import request from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { expect, inject } from 'vitest';

import { scanUploadedFile, scanWithClamav } from '../../../src/modules/doc/index.js';
import { storage, type SampleFile } from '../doc/support/file-scenario.js';
import type { AccessScenario, Person } from '../iam/support/access-scenario.js';
import { WEB_ORIGIN, freshIp, type SignedIn } from '../iam/support/iam-fixtures.js';
import { apiDatabase } from './integration-database.js';

// Pasos de las pruebas de la foto de perfil y del logo (B22A): imágenes reales que pasan por
// Garage y ClamAV, como en la gestión documental.

/** Imagen PNG de 1 × 1 píxel, válida para el reconocimiento del tipo. */
export function samplePng(): SampleFile {
  const content = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  return { name: 'Foto.png', type: 'image/png', content };
}

function withSession(call: request.Test, session: SignedIn): request.Test {
  return call
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp())
    .set('Cookie', session.cookie)
    .set('X-CSRF-Token', session.session.csrf_token);
}

export function putJson(
  s: AccessScenario,
  path: string,
  session: SignedIn,
  body: object,
): request.Test {
  return withSession(request(s.app.getHttpServer()).put(path), session).send(body);
}

export function remove(s: AccessScenario, path: string, session: SignedIn): request.Test {
  return withSession(request(s.app.getHttpServer()).delete(path), session);
}

/** Imagen entregada por la API, como bytes. */
export function getImage(s: AccessScenario, path: string, session: SignedIn): request.Test {
  return request(s.app.getHttpServer())
    .get(path)
    .set('Cookie', session.cookie)
    .buffer(true)
    .parse((response, done) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        done(null, Buffer.concat(chunks));
      });
    });
}

/** Pide el enlace en la ruta dada, sube la imagen y, salvo que se pida, la analiza; devuelve su id. */
export async function uploadImage(
  s: AccessScenario,
  person: Person,
  uploadsPath: string,
  options: { readonly tenantId?: string; readonly file?: SampleFile; readonly scan?: boolean } = {},
): Promise<string> {
  const file = options.file ?? samplePng();
  const body = { file_name: file.name, mime_type: file.type, size_bytes: file.content.length };
  const asked = await s.post(uploadsPath, person.session, body);
  expect(asked.status, asked.text).toBe(201);
  const link = uploadLinkResponseSchema.parse(asked.body);
  const sent = await request(s.app.getHttpServer())
    .put(new URL(link.upload_url).pathname)
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp())
    .set('Content-Type', file.type)
    .send(file.content);
  expect(sent.status, sent.text).toBe(204);
  if (options.scan === false) return link.id;
  const tenantId = options.tenantId ?? s.tenant.id;
  await scanUploadedFile(
    { tenantId, userId: null, correlationId: uuidv7(), fileId: link.id },
    {
      database: apiDatabase(),
      clock: s.clock,
      storage: storage(),
      antivirus: async (content) =>
        scanWithClamav({ ...inject('antivirus'), timeoutMs: 10_000 }, content),
    },
  );
  return link.id;
}
