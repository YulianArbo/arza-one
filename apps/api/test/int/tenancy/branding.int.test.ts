import { tenantBrandingSchema, type TenantBranding } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { AccessScenario, type Person } from '../iam/support/access-scenario.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import { getImage, uploadImage } from '../support/image-steps.js';
import { actionsIn, sendAs } from './support/tenancy-fixture.js';

// Marca propia de la empresa (B48, decisión 11): la cambia su administración, la ve toda su gente
// y no se cruza entre empresas. El color tiene que leerse sobre blanco.

const s = new AccessScenario('marca');

async function brandingOf(person: Person): Promise<TenantBranding> {
  const response = await s.get('/v1/me/branding', person.session);
  expect(response.status, response.text).toBe(200);
  return tenantBrandingSchema.parse(response.body);
}

describe('marca de la empresa', () => {
  it('el administrador la cambia y toda la empresa la ve; la otra empresa no', async () => {
    const admin = await s.person('admin-marca', ['ADMIN_PLATAFORMA']);
    const worker = await s.person('colaborador-marca', ['COLABORADOR']);
    const outsider = await s.person('colaborador-otra-marca', ['COLABORADOR'], {
      tenantId: s.otherTenant.id,
    });
    const { version } = await brandingOf(admin);
    const response = await sendAs(s, 'put', '/v1/tenant/branding', admin.session, {
      body: { display_name: 'Marca Propia', primary_color: '#1f4e79' },
      version,
    });
    expect(response.status, response.text).toBe(200);
    expect(await brandingOf(worker)).toMatchObject({
      display_name: 'Marca Propia',
      primary_color: '#1F4E79',
    });
    const other = await brandingOf(outsider);
    expect(other.display_name).not.toBe('Marca Propia');
    expect(other.primary_color).toBeNull();
    expect(await actionsIn(s, s.tenant.id)).toContain('core.tenant.branding_update');
  });
});

describe('marca de la empresa', () => {
  it('rechaza un color que no se lee sobre blanco', async () => {
    const admin = await s.person('admin-color', ['ADMIN_PLATAFORMA']);
    const { version } = await brandingOf(admin);
    const response = await sendAs(s, 'put', '/v1/tenant/branding', admin.session, {
      body: { display_name: null, primary_color: '#FFEE88' },
      version,
    });
    expect(response.status).toBe(422);
  });
});

describe('marca de la empresa', () => {
  it('quien no administra la empresa no la cambia (permiso denegado)', async () => {
    const worker = await s.person('colaborador-sin-marca', ['COLABORADOR', 'DIRECCION']);
    const { version } = await brandingOf(worker);
    const response = await sendAs(s, 'put', '/v1/tenant/branding', worker.session, {
      body: { display_name: 'Intento', primary_color: null },
      version,
    });
    expect(response.status).toBe(403);
    expect(errorCode(response)).toBe('PERMISSION_DENIED');
  });
});

describe('marca de la empresa', () => {
  it('el logo lo sube la administración y lo ve toda la empresa', async () => {
    const admin = await s.person('admin-logo', ['ADMIN_PLATAFORMA']);
    const worker = await s.person('colaborador-logo', ['COLABORADOR']);
    expect((await getImage(s, '/v1/me/branding/logo', worker.session)).status).toBe(404);
    const fileId = await uploadImage(s, admin, '/v1/tenant/branding/logo/uploads');
    const set = await sendAs(s, 'put', '/v1/tenant/branding/logo', admin.session, {
      body: { file_id: fileId },
    });
    expect(set.status, set.text).toBe(204);
    expect((await brandingOf(worker)).has_logo).toBe(true);
    const logo = await getImage(s, '/v1/me/branding/logo', worker.session);
    expect(logo.status).toBe(200);
    expect(logo.headers['content-type']).toContain('image/png');
    const outsider = await s.person('colaborador-otra-logo', ['COLABORADOR'], {
      tenantId: s.otherTenant.id,
    });
    expect((await getImage(s, '/v1/me/branding/logo', outsider.session)).status).toBe(404);
    const removed = await sendAs(s, 'delete', '/v1/tenant/branding/logo', admin.session);
    expect(removed.status).toBe(204);
    expect((await brandingOf(worker)).has_logo).toBe(false);
  });
});

describe('marca de la empresa', () => {
  it('una versión vieja no pisa el cambio de otra persona', async () => {
    const admin = await s.person('admin-version-marca', ['ADMIN_PLATAFORMA']);
    const { version } = await brandingOf(admin);
    const first = await sendAs(s, 'put', '/v1/tenant/branding', admin.session, {
      body: { display_name: 'Primera', primary_color: null },
      version,
    });
    expect(first.status, first.text).toBe(200);
    const stale = await sendAs(s, 'put', '/v1/tenant/branding', admin.session, {
      body: { display_name: 'Segunda', primary_color: null },
      version,
    });
    expect(stale.status).toBe(409);
    expect((await brandingOf(admin)).display_name).toBe('Primera');
  });
});

describe('marca de la empresa', () => {
  it('poner el mismo logo dos veces no deja un cambio de más en la auditoría', async () => {
    const admin = await s.person('admin-logo-repetido', ['ADMIN_PLATAFORMA']);
    const fileId = await uploadImage(s, admin, '/v1/tenant/branding/logo/uploads');
    for (let time = 0; time < 2; time += 1) {
      const set = await sendAs(s, 'put', '/v1/tenant/branding/logo', admin.session, {
        body: { file_id: fileId },
      });
      expect(set.status, set.text).toBe(204);
    }
    const changes = await s.db.withTenant({ tenantId: s.tenant.id, userId: null }, (tx) =>
      tx.auditEvent.count({
        where: {
          action: 'core.tenant.logo_update',
          changes: { path: ['brand_logo_file_id', 'to'], equals: fileId },
        },
      }),
    );
    expect(changes).toBe(1);
  });
});
