import request from 'supertest';

import { addDays, bogotaToday, fromCalendarDate } from '../../../../src/modules/core/index.js';
import { WEB_ORIGIN, freshIp, type SignedIn } from '../../iam/support/iam-fixtures.js';
import type { AccessScenario } from '../../iam/support/access-scenario.js';

// Llamadas del recorrido de escrituras (B11) para los comunicados del acceso (B36A).

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

async function adminSession(s: AccessScenario): Promise<SignedIn> {
  return (await s.person('admin-comunicados', ['ADMIN_PLATAFORMA'])).session;
}

const TODAY = bogotaToday(new Date());

const ANNOUNCEMENT = {
  title: 'Comunicado del recorrido',
  body: 'Texto del comunicado del recorrido.',
  audience: 'both',
  starts_on: TODAY,
  ends_on: addDays(TODAY, 3),
};

function newAnnouncement(s: AccessScenario) {
  return s.inTenant((tx) =>
    tx.announcement.create({
      data: {
        tenantId: s.tenant.id,
        title: ANNOUNCEMENT.title,
        body: ANNOUNCEMENT.body,
        audience: 'both',
        startsOn: fromCalendarDate(ANNOUNCEMENT.starts_on),
        endsOn: fromCalendarDate(ANNOUNCEMENT.ends_on),
      },
    }),
  );
}

/** Comunicados del acceso (B36A). */
export const ANNOUNCEMENT_CALLS: Readonly<Record<string, RouteCall>> = {
  'POST /v1/announcements': async (s) => ({
    test: s.post('/v1/announcements', await adminSession(s), ANNOUNCEMENT),
  }),
  'POST /v1/announcements/uploads': async (s) => {
    const image = { file_name: 'Comunicado.png', mime_type: 'image/png', size_bytes: 68 };
    return { test: s.post('/v1/announcements/uploads', await adminSession(s), image) };
  },
  'PATCH /v1/announcements/{id}': async (s) => {
    const announcement = await newAnnouncement(s);
    const body = { ...ANNOUNCEMENT, title: 'Comunicado editado' };
    return {
      test: s.patch(`/v1/announcements/${announcement.id}`, await adminSession(s), body, 1),
    };
  },
  'POST /v1/announcements/{id}/end': async (s) => {
    const announcement = await newAnnouncement(s);
    const session = await adminSession(s);
    const test = request(s.app.getHttpServer())
      .post(`/v1/announcements/${announcement.id}/end`)
      .set('Origin', WEB_ORIGIN)
      .set('X-Forwarded-For', freshIp())
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.session.csrf_token)
      .set('If-Match', '"1"')
      .send({});
    return { test };
  },
};
