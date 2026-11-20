import {
  announcementListResponseSchema,
  publicAnnouncementListResponseSchema,
  type AnnouncementRequestInput,
} from '@arza/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { addDays, bogotaToday, fromCalendarDate } from '../../../src/modules/core/index.js';
import { WEB_ORIGIN, auditActions, errorCode, freshIp } from '../iam/support/iam-fixtures.js';
import type { Person } from '../iam/support/access-scenario.js';
import { uploadImage } from '../support/image-steps.js';
import { CoreScenario, unique } from './support/core-scenario.js';

// Comunicados del acceso (B36A): vigencia por fechas de Colombia, público por pestaña, imagen,
// terminar antes de tiempo, permiso denegado, aislamiento entre empresas y auditoría.

const scenario = new CoreScenario('comunicados');
const TODAY = bogotaToday(new Date());

function body(overrides: Partial<AnnouncementRequestInput> = {}): AnnouncementRequestInput {
  return {
    title: unique('Comunicado '),
    body: 'La plataforma estará en mantenimiento el sábado de 6 a 8 a. m.',
    audience: 'both',
    starts_on: TODAY,
    ends_on: addDays(TODAY, 5),
    ...overrides,
  };
}

function publicGet(path: string): request.Test {
  return request(scenario.app.getHttpServer())
    .get(path)
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp());
}

async function publicTitles(audience: 'staff' | 'clients'): Promise<string[]> {
  const response = await publicGet(`/v1/public/announcements?audience=${audience}`);
  expect(response.status, response.text).toBe(200);
  return publicAnnouncementListResponseSchema.parse(response.body).data.map((item) => item.title);
}

async function adminList(person: Person) {
  const response = await scenario.get('/v1/announcements', person.session);
  return announcementListResponseSchema.parse(response.body).data;
}

describe('comunicados en el acceso', () => {
  it('cada pestaña ve los suyos y los de ambos, solo mientras están vigentes', async () => {
    const admin = await scenario.admin();
    const both = body();
    const staff = body({ audience: 'staff' });
    const clients = body({ audience: 'clients' });
    const later = body({ starts_on: addDays(TODAY, 1) });
    for (const item of [both, staff, clients, later]) {
      await scenario.create('/v1/announcements', admin, item);
    }
    const staffTab = await publicTitles('staff');
    expect(staffTab).toEqual(expect.arrayContaining([both.title, staff.title]));
    expect(staffTab).not.toContain(clients.title);
    const clientsTab = await publicTitles('clients');
    expect(clientsTab).toEqual(expect.arrayContaining([both.title, clients.title]));
    expect(clientsTab).not.toContain(staff.title);
    expect([...staffTab, ...clientsTab]).not.toContain(later.title);
    const statuses = new Map((await adminList(admin)).map((item) => [item.title, item.status]));
    expect(statuses.get(both.title)).toBe('active');
    expect(statuses.get(later.title)).toBe('scheduled');
  });
});

describe('comunicados vencidos', () => {
  it('un comunicado vencido ya no se ve y aparece como vencido', async () => {
    const admin = await scenario.admin();
    const title = unique('Vencido ');
    await scenario.inTenant((tx) =>
      tx.announcement.create({
        data: {
          tenantId: scenario.tenant.id,
          title,
          body: 'Ya pasó.',
          audience: 'both',
          startsOn: fromCalendarDate(addDays(TODAY, -10)),
          endsOn: fromCalendarDate(addDays(TODAY, -1)),
        },
      }),
    );
    expect(await publicTitles('staff')).not.toContain(title);
    const expired = (await adminList(admin)).find((item) => item.title === title);
    expect(expired?.status).toBe('expired');
  });
});

describe('editar y terminar', () => {
  it('se edita con su versión, se termina antes de tiempo y todo queda auditado', async () => {
    const admin = await scenario.admin();
    const first = body();
    const id = await scenario.create('/v1/announcements', admin, first);
    const edited = { ...first, title: unique('Editado ') };
    const patch = await scenario.patch(`/v1/announcements/${id}`, admin.session, edited, 1);
    expect(patch.status, patch.text).toBe(200);
    expect(await publicTitles('staff')).toContain(edited.title);
    const end = await scenario.postWithVersion(`/v1/announcements/${id}/end`, admin.session, 2);
    expect(end.status, end.text).toBe(204);
    expect(await publicTitles('staff')).not.toContain(edited.title);
    const again = await scenario.patch(`/v1/announcements/${id}`, admin.session, edited, 3);
    expect(errorCode(again)).toBe('CORE_ANNOUNCEMENT_ENDED');
    expect(await auditActions(scenario.db, scenario.tenant.id, id)).toEqual([
      'core.announcement.create:success',
      'core.announcement.update:success',
      'core.announcement.end:success',
    ]);
  });

  it('no acepta una fecha de fin pasada ni una versión vieja', async () => {
    const admin = await scenario.admin();
    const past = body({ starts_on: addDays(TODAY, -3), ends_on: addDays(TODAY, -1) });
    expect(errorCode(await scenario.post('/v1/announcements', admin.session, past))).toBe(
      'CORE_ANNOUNCEMENT_PAST',
    );
    const id = await scenario.create('/v1/announcements', admin, body());
    const stale = await scenario.patch(`/v1/announcements/${id}`, admin.session, body(), 7);
    expect(stale.status).toBe(409);
  });
});

describe('imagen del comunicado', () => {
  it('la imagen revisada se ve en el acceso mientras el comunicado está vigente', async () => {
    const admin = await scenario.admin();
    const fileId = await uploadImage(scenario, admin, '/v1/announcements/uploads');
    const item = body({ image_file_id: fileId });
    const id = await scenario.create('/v1/announcements', admin, item);
    const listed = await publicGet('/v1/public/announcements?audience=clients');
    const found = publicAnnouncementListResponseSchema
      .parse(listed.body)
      .data.find((announcement) => announcement.id === id);
    expect(found?.has_image).toBe(true);
    const image = await publicGet(`/v1/public/announcements/${id}/image`);
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');
    await scenario.postWithVersion(`/v1/announcements/${id}/end`, admin.session, 1);
    expect((await publicGet(`/v1/public/announcements/${id}/image`)).status).toBe(404);
  });

  it('no acepta como imagen un archivo que no es propio', async () => {
    const admin = await scenario.admin();
    const other = await scenario.person('direccion', ['DIRECCION']);
    const fileId = await uploadImage(scenario, other, '/v1/announcements/uploads');
    const response = await scenario.post(
      '/v1/announcements',
      admin.session,
      body({ image_file_id: fileId }),
    );
    expect(errorCode(response)).toBe('IMAGE_INVALID');
  });
});

describe('comunicados: permiso denegado', () => {
  it('la Dirección los administra; un colaborador y un cliente no', async () => {
    const direction = await scenario.person('direccion', ['DIRECCION']);
    await scenario.create('/v1/announcements', direction, body());
    const worker = await scenario.person('colaborador', ['COLABORADOR']);
    const portal = await scenario.person('portal', ['CLIENTE_ADMIN'], { kind: 'portal' });
    for (const person of [worker, portal]) {
      const calls = [
        scenario.get('/v1/announcements', person.session),
        scenario.post('/v1/announcements', person.session, body()),
      ];
      for (const response of await Promise.all(calls)) {
        expect(errorCode(response)).toBe('PERMISSION_DENIED');
      }
    }
  });
});

describe('comunicados: aislamiento entre empresas', () => {
  it('la empresa B no ve ni edita los de A, y el acceso solo muestra los de la empresa del sitio', async () => {
    const adminA = await scenario.admin();
    const adminB = await scenario.admin(scenario.otherTenant.id);
    const fromA = body();
    const id = await scenario.create('/v1/announcements', adminA, fromA);
    expect((await adminList(adminB)).map((item) => item.id)).not.toContain(id);
    const edit = await scenario.patch(`/v1/announcements/${id}`, adminB.session, fromA, 1);
    expect(errorCode(edit)).toBe('CORE_RECORD_NOT_FOUND');
    const fromB = body();
    await scenario.create('/v1/announcements', adminB, fromB);
    expect(await publicTitles('staff')).not.toContain(fromB.title);
  });
});
