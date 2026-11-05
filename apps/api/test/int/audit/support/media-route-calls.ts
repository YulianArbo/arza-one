import { createdResponseSchema, uploadLinkResponseSchema } from '@arza/contracts';
import type request from 'supertest';

import { seedCore } from '../../../../src/modules/core/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import { apiDatabase } from '../../support/integration-database.js';
import { putJson, remove } from '../../support/image-steps.js';
import type { SignedIn } from '../../iam/support/iam-fixtures.js';
import type { AccessScenario } from '../../iam/support/access-scenario.js';
import { organizationBody } from '../../party/support/party-scenario.js';

// Llamadas del recorrido de escrituras (B11) para la foto de perfil y el logo (B22A). La imagen se
// marca disponible en la base, sin esperar al antivirus del worker.

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

const IMAGE = { file_name: 'Foto.png', mime_type: 'image/png', size_bytes: 68 };

async function person(s: AccessScenario): Promise<SignedIn> {
  return (await s.person('foto-recorrido', ['COLABORADOR'])).session;
}

async function sales(s: AccessScenario): Promise<SignedIn> {
  await seedCore(apiDatabase(), [s.tenant.id], systemClock);
  return (await s.person('logo-recorrido', ['COMERCIAL'])).session;
}

/** Imagen subida por la persona por la ruta dada y marcada disponible. */
async function image(s: AccessScenario, session: SignedIn, uploads: string): Promise<string> {
  const link = uploadLinkResponseSchema.parse((await s.post(uploads, session, IMAGE)).body);
  await s.db.withTenant({ tenantId: s.tenant.id, userId: null }, (tx) =>
    tx.file.update({
      where: { id: link.id },
      data: { scanStatus: 'available', sha256: '0'.repeat(64), scannedAt: new Date() },
    }),
  );
  return link.id;
}

async function organization(s: AccessScenario, session: SignedIn): Promise<string> {
  const response = await s.post('/v1/parties', session, organizationBody());
  return createdResponseSchema.parse(response.body).id;
}

/** Organización con logo, lista para quitarlo. */
async function withLogo(s: AccessScenario) {
  const session = await sales(s);
  const id = await organization(s, session);
  const file = await image(s, session, `/v1/parties/${id}/logo/uploads`);
  await putJson(s, `/v1/parties/${id}/logo`, session, { file_id: file });
  return { session, id };
}

export const MEDIA_ROUTE_CALLS: Record<string, RouteCall> = {
  'POST /v1/me/photo/uploads': async (s) => ({
    test: s.post('/v1/me/photo/uploads', await person(s), IMAGE),
  }),
  'PUT /v1/me/photo': async (s) => {
    const session = await person(s);
    const file = await image(s, session, '/v1/me/photo/uploads');
    return { test: putJson(s, '/v1/me/photo', session, { file_id: file }) };
  },
  'DELETE /v1/me/photo': async (s) => {
    const session = await person(s);
    const file = await image(s, session, '/v1/me/photo/uploads');
    await putJson(s, '/v1/me/photo', session, { file_id: file });
    return { test: remove(s, '/v1/me/photo', session) };
  },
  'POST /v1/parties/{id}/logo/uploads': async (s) => {
    const session = await sales(s);
    const id = await organization(s, session);
    return { test: s.post(`/v1/parties/${id}/logo/uploads`, session, IMAGE) };
  },
  'PUT /v1/parties/{id}/logo': async (s) => {
    const session = await sales(s);
    const id = await organization(s, session);
    const file = await image(s, session, `/v1/parties/${id}/logo/uploads`);
    return { test: putJson(s, `/v1/parties/${id}/logo`, session, { file_id: file }) };
  },
  'DELETE /v1/parties/{id}/logo': async (s) => {
    const { session, id } = await withLogo(s);
    return { test: remove(s, `/v1/parties/${id}/logo`, session) };
  },
};
