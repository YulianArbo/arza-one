import { uploadLinkResponseSchema, type UploadLinkResponse } from '@arza/contracts';
import request from 'supertest';

import { WEB_ORIGIN, freshIp, type SignedIn } from '../../iam/support/iam-fixtures.js';
import type { AccessScenario } from '../../iam/support/access-scenario.js';
import { pdfFile } from '../../doc/support/file-scenario.js';

// Llamadas del recorrido de escrituras (B11) para las rutas de archivos (B14).

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

const FILE = pdfFile();

async function quality(s: AccessScenario): Promise<SignedIn> {
  return (await s.person('calidad-recorrido', ['CALIDAD'])).session;
}

function requestUpload(s: AccessScenario, session: SignedIn): request.Test {
  return s.post('/v1/files', session, {
    file_name: 'acta.pdf',
    mime_type: FILE.type,
    size_bytes: FILE.content.length,
  });
}

function put(s: AccessScenario, link: UploadLinkResponse): request.Test {
  return request(s.app.getHttpServer())
    .put(new URL(link.upload_url).pathname)
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp())
    .set('Content-Type', FILE.type)
    .send(FILE.content);
}

async function uploaded(s: AccessScenario, session: SignedIn): Promise<UploadLinkResponse> {
  return uploadLinkResponseSchema.parse((await requestUpload(s, session)).body);
}

/** Un archivo disponible: se marca directamente, sin esperar al worker. */
async function available(s: AccessScenario, session: SignedIn): Promise<string> {
  const link = await uploaded(s, session);
  await put(s, link);
  await s.db.withTenant({ tenantId: s.tenant.id, userId: null }, (tx) =>
    tx.file.update({
      where: { id: link.id },
      data: { scanStatus: 'available', sha256: '0'.repeat(64), scannedAt: new Date() },
    }),
  );
  return link.id;
}

export const DOC_ROUTE_CALLS: Record<string, RouteCall> = {
  'POST /v1/files': async (s) => ({ test: requestUpload(s, await quality(s)) }),
  'PUT /v1/files/uploads/{token}': async (s) => ({
    test: put(s, await uploaded(s, await quality(s))),
  }),
  'POST /v1/files/{id}/download-link': async (s) => {
    const session = await quality(s);
    return { test: s.post(`/v1/files/${await available(s, session)}/download-link`, session) };
  },
};
