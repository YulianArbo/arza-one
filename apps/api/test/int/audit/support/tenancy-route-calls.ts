import {
  tenantBrandingSchema,
  tenantExportCreatedResponseSchema,
  uploadLinkResponseSchema,
} from '@arza/contracts';
import type request from 'supertest';

import { runTenantExportWork } from '../../../../src/modules/tenancy/index.js';
import { storage } from '../../doc/support/file-scenario.js';
import { uniqueEmail } from '../../iam/support/iam-fixtures.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import {
  apiDatabase,
  createTenant,
  newTestTenant,
  preparationDatabase,
} from '../../support/integration-database.js';
import { card, freshNit, operator, sendAs } from '../../tenancy/support/tenancy-fixture.js';

// Rutas de multiempresa (B48) que escriben, para el recorrido de auditoría. Lo que hace el
// operador queda en la auditoría de la empresa operadora; lo demás, en la de la empresa.

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

const IMAGE = { file_name: 'Logo.png', mime_type: 'image/png', size_bytes: 68 };
const REASON = 'Prueba del recorrido de auditoría de multiempresa.';
const ENTERPRISE = {
  plan: 'enterprise',
  max_internal_users: null,
  max_portal_users: null,
  storage_mb: null,
  ai_assistant: null,
};

async function freshTenant(): Promise<string> {
  const tenant = newTestTenant('recorrido-multiempresa');
  await createTenant(preparationDatabase(), tenant);
  return tenant.id;
}

/** Empresa suspendida con su exportación lista, para pedir su eliminación. */
async function readyForDeletion(s: AccessScenario): Promise<{ op: Person; id: string }> {
  const id = await freshTenant();
  const boss = await s.person('direccion-recorrido-eliminar', ['DIRECCION'], { tenantId: id });
  await sendAs(s, 'post', '/v1/tenant/exports', boss.session);
  await runTenantExportWork({ database: apiDatabase(), clock: s.clock, storage: storage() });
  const op = await operator(s, 'operador-recorrido-eliminar');
  const { version } = await card(s, op, id);
  const suspend = `/v1/platform/tenants/${id}/suspend`;
  await sendAs(s, 'post', suspend, op.session, { body: { reason: REASON }, version });
  return { op, id };
}

async function brandingVersion(s: AccessScenario, admin: Person): Promise<number> {
  const response = await s.get('/v1/me/branding', admin.session);
  return tenantBrandingSchema.parse(response.body).version;
}

/** Imagen subida por la administración y marcada disponible, sin esperar al antivirus. */
async function logoImage(s: AccessScenario, admin: Person): Promise<string> {
  const asked = await s.post('/v1/tenant/branding/logo/uploads', admin.session, IMAGE);
  const link = uploadLinkResponseSchema.parse(asked.body);
  await s.db.withTenant({ tenantId: s.tenant.id, userId: null }, (tx) =>
    tx.file.update({
      where: { id: link.id },
      data: { scanStatus: 'available', sha256: '0'.repeat(64), scannedAt: new Date() },
    }),
  );
  return link.id;
}

const PLATFORM_CALLS: Readonly<Record<string, RouteCall>> = {
  'POST /v1/platform/tenants': async (s) => {
    const op = await operator(s, 'operador-recorrido-alta');
    const body = {
      legal_name: 'Recorrido S.A.S.',
      trade_name: null,
      tax_id: freshNit(),
      plan: 'basic',
      admin: { email: uniqueEmail('admin-recorrido'), display_name: 'Ana Recorrido' },
    };
    return { test: sendAs(s, 'post', '/v1/platform/tenants', op.session, { body }) };
  },
  'PUT /v1/platform/tenants/{id}/plan': async (s) => {
    const op = await operator(s, 'operador-recorrido-plan');
    const id = await freshTenant();
    const { version } = await card(s, op, id);
    const path = `/v1/platform/tenants/${id}/plan`;
    return { test: sendAs(s, 'put', path, op.session, { body: ENTERPRISE, version }) };
  },
  'POST /v1/platform/tenants/{id}/suspend': async (s) => {
    const op = await operator(s, 'operador-recorrido-suspende');
    const id = await freshTenant();
    const { version } = await card(s, op, id);
    const path = `/v1/platform/tenants/${id}/suspend`;
    return { test: sendAs(s, 'post', path, op.session, { body: { reason: REASON }, version }) };
  },
  'POST /v1/platform/tenants/{id}/reactivate': async (s) => {
    const op = await operator(s, 'operador-recorrido-reactiva');
    const id = await freshTenant();
    const active = await card(s, op, id);
    await sendAs(s, 'post', `/v1/platform/tenants/${id}/suspend`, op.session, {
      body: { reason: REASON },
      version: active.version,
    });
    const { version } = await card(s, op, id);
    const path = `/v1/platform/tenants/${id}/reactivate`;
    return { test: sendAs(s, 'post', path, op.session, { version }) };
  },
  'POST /v1/platform/tenants/{id}/deletion': async (s) => {
    const { op, id } = await readyForDeletion(s);
    const { version, tax_id: taxId } = await card(s, op, id);
    const body = { reason: REASON, confirm_tax_id: taxId };
    const path = `/v1/platform/tenants/${id}/deletion`;
    return { test: sendAs(s, 'post', path, op.session, { body, version }) };
  },
  'DELETE /v1/platform/tenants/{id}/deletion': async (s) => {
    const { op, id } = await readyForDeletion(s);
    const path = `/v1/platform/tenants/${id}/deletion`;
    const suspended = await card(s, op, id);
    await sendAs(s, 'post', path, op.session, {
      body: { reason: REASON, confirm_tax_id: suspended.tax_id },
      version: suspended.version,
    });
    const { version } = await card(s, op, id);
    return { test: sendAs(s, 'delete', path, op.session, { version }) };
  },
};

const COMPANY_CALLS: Readonly<Record<string, RouteCall>> = {
  'PUT /v1/tenant/branding': async (s) => {
    const admin = await s.person('admin-recorrido-marca', ['ADMIN_PLATAFORMA']);
    const version = await brandingVersion(s, admin);
    const body = { display_name: 'Marca del recorrido', primary_color: '#1F4E79' };
    return { test: sendAs(s, 'put', '/v1/tenant/branding', admin.session, { body, version }) };
  },
  'POST /v1/tenant/branding/logo/uploads': async (s) => {
    const admin = await s.person('admin-recorrido-sube-logo', ['ADMIN_PLATAFORMA']);
    return { test: s.post('/v1/tenant/branding/logo/uploads', admin.session, IMAGE) };
  },
  'PUT /v1/tenant/branding/logo': async (s) => {
    const admin = await s.person('admin-recorrido-logo', ['ADMIN_PLATAFORMA']);
    const body = { file_id: await logoImage(s, admin) };
    return { test: sendAs(s, 'put', '/v1/tenant/branding/logo', admin.session, { body }) };
  },
  'DELETE /v1/tenant/branding/logo': async (s) => {
    const admin = await s.person('admin-recorrido-quita-logo', ['ADMIN_PLATAFORMA']);
    const body = { file_id: await logoImage(s, admin) };
    await sendAs(s, 'put', '/v1/tenant/branding/logo', admin.session, { body });
    return { test: sendAs(s, 'delete', '/v1/tenant/branding/logo', admin.session) };
  },
  'POST /v1/tenant/exports/{id}/download': async (s) => {
    const boss = await s.person('direccion-recorrido-descarga', ['DIRECCION'], {
      tenantId: s.otherTenant.id,
    });
    const work = { database: apiDatabase(), clock: s.clock, storage: storage() };
    await runTenantExportWork(work);
    const asked = await sendAs(s, 'post', '/v1/tenant/exports', boss.session);
    const { id } = tenantExportCreatedResponseSchema.parse(asked.body);
    await runTenantExportWork(work);
    return { test: sendAs(s, 'post', `/v1/tenant/exports/${id}/download`, boss.session) };
  },
  'POST /v1/tenant/exports': async (s) => {
    const boss = await s.person('direccion-recorrido-exporta', ['DIRECCION'], {
      tenantId: s.otherTenant.id,
    });
    return { test: sendAs(s, 'post', '/v1/tenant/exports', boss.session) };
  },
};

export const TENANCY_ROUTE_CALLS: Readonly<Record<string, RouteCall>> = {
  ...PLATFORM_CALLS,
  ...COMPANY_CALLS,
};
