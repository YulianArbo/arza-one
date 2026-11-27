import { describe, expect, it } from 'vitest';

import { OPERATOR_TENANT_ID } from '../../../src/platform/database/operator-tenant.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import {
  createUser,
  errorCode,
  signInWithPassword,
  tenantScope,
  uniqueEmail,
} from '../iam/support/iam-fixtures.js';
import { createTenant, newTestTenant } from '../support/integration-database.js';
import { actionsIn, card, operator, sendAs } from './support/tenancy-fixture.js';

// Ciclo de vida de una empresa (B48): plan y límites que hace cumplir la base de datos, suspensión
// que corta el acceso en la petición siguiente y detiene sus tareas, y eliminación con requisitos.

const s = new AccessScenario('ciclo de vida');

const PLAN_BASIC = {
  plan: 'basic',
  max_internal_users: null,
  max_portal_users: null,
  storage_mb: null,
  ai_assistant: null,
};

async function freshTenant(label: string): Promise<string> {
  const tenant = newTestTenant(label);
  await createTenant(s.db, tenant);
  return tenant.id;
}

/** Un evento sin publicar en la bandeja de salida de la empresa. */
async function pendingEvent(tenantId: string): Promise<void> {
  await tenantScope(
    s.db,
    tenantId,
  )((tx) => tx.outboxEvent.create({ data: { tenantId, eventType: 'test.pending', payload: {} } }));
}

/** Empresas que el worker atendería para publicar sus eventos. */
async function tenantsWithPendingEvents(): Promise<string[]> {
  const rows = await tenantScope(
    s.db,
    OPERATOR_TENANT_ID,
  )((tx) => tx.$queryRaw<{ id: string }[]>`SELECT ntf_tenants_with_pending_events() AS id`);
  return rows.map((row) => row.id);
}

describe('plan y límites', () => {
  it('el operador cambia el plan y la empresa no pasa de su tope de usuarios', async () => {
    const op = await operator(s, 'operador-plan');
    const tenantId = await freshTenant('plan');
    const before = await card(s, op, tenantId);
    const plan = { ...PLAN_BASIC, max_internal_users: 1 };
    const path = `/v1/platform/tenants/${tenantId}/plan`;
    const changed = await sendAs(s, 'put', path, op.session, {
      body: plan,
      version: before.version,
    });
    expect(changed.status, changed.text).toBe(204);
    const after = await card(s, op, tenantId);
    expect(after.limits).toEqual({
      max_internal_users: 1,
      max_portal_users: 20,
      storage_mb: 5120,
      ai_assistant: false,
    });
    await createUser(s.db, { tenantId, email: uniqueEmail('cabe') });
    await expect(createUser(s.db, { tenantId, email: uniqueEmail('sobra') })).rejects.toThrow(
      'PLAN_LIMIT:internal_users',
    );
    const stale = await sendAs(s, 'put', path, op.session, {
      body: PLAN_BASIC,
      version: before.version,
    });
    expect(stale.status).toBe(409);
    expect(await actionsIn(s, tenantId)).toContain('core.tenant.plan_change');
  });
});

describe('plan y límites', () => {
  it('al invitar por encima del plan, la persona recibe un mensaje claro', async () => {
    const op = await operator(s, 'operador-tope');
    const admin = await s.person('admin-tope', ['ADMIN_PLATAFORMA'], {
      tenantId: s.otherTenant.id,
    });
    const used = (await card(s, op, s.otherTenant.id)).usage?.internal_users ?? 0;
    const current = await card(s, op, s.otherTenant.id);
    const path = `/v1/platform/tenants/${s.otherTenant.id}/plan`;
    const limited = { ...PLAN_BASIC, plan: 'professional', max_internal_users: used };
    expect(
      (await sendAs(s, 'put', path, op.session, { body: limited, version: current.version }))
        .status,
    ).toBe(204);
    const invite = { email: uniqueEmail('no-cabe'), kind: 'internal', display_name: 'No Cabe' };
    const response = await s.post('/v1/users', admin.session, invite);
    expect(response.status, response.text).toBe(409);
    expect(errorCode(response)).toBe('PLAN_LIMIT_REACHED');
    const restored = await card(s, op, s.otherTenant.id);
    const back = { ...PLAN_BASIC, plan: 'professional' };
    expect(
      (await sendAs(s, 'put', path, op.session, { body: back, version: restored.version })).status,
    ).toBe(204);
  });
});

describe('suspensión', () => {
  it('cierra las sesiones, impide entrar y detiene las tareas automáticas', async () => {
    const op = await operator(s, 'operador-suspende');
    const tenantId = await freshTenant('suspendida');
    const worker = await s.person('colaborador-suspendido', ['COLABORADOR'], { tenantId });
    expect((await s.get('/v1/me', worker.session)).status).toBe(200);
    await pendingEvent(tenantId);
    const { version } = await card(s, op, tenantId);
    const path = `/v1/platform/tenants/${tenantId}/suspend`;
    const suspended = await sendAs(s, 'post', path, op.session, {
      body: { reason: 'Contrato terminado por falta de pago.' },
      version,
    });
    expect(suspended.status, suspended.text).toBe(204);
    expect((await s.get('/v1/me', worker.session)).status).toBe(401);
    const login = await signInWithPassword(s.app, worker.email).catch((error: unknown) => error);
    expect(String(login)).toContain('403');
    expect(await tenantsWithPendingEvents()).not.toContain(tenantId);
    expect(await actionsIn(s, tenantId)).toContain('core.tenant.suspend');
    expect(await actionsIn(s, OPERATOR_TENANT_ID)).toContain('platform.tenant.suspend');
  });
});

describe('reactivación', () => {
  it('una empresa reactivada vuelve a entrar', async () => {
    const op = await operator(s, 'operador-reactiva');
    const tenantId = await freshTenant('reactivada');
    const worker = await s.person('colaborador-reactivado', ['COLABORADOR'], { tenantId });
    const active = await card(s, op, tenantId);
    await sendAs(s, 'post', `/v1/platform/tenants/${tenantId}/suspend`, op.session, {
      body: { reason: 'Suspensión temporal por revisión.' },
      version: active.version,
    });
    const { version } = await card(s, op, tenantId);
    const path = `/v1/platform/tenants/${tenantId}/reactivate`;
    const reactivated = await sendAs(s, 'post', path, op.session, { version });
    expect(reactivated.status, reactivated.text).toBe(204);
    const again = await s.refresh(worker);
    expect((await s.get('/v1/me', again.session)).status).toBe(200);
  });
});

describe('suspensión', () => {
  it('la empresa operadora no se puede suspender', async () => {
    const op = await operator(s, 'operador-protegida');
    const { version } = await card(s, op, OPERATOR_TENANT_ID);
    const response = await sendAs(
      s,
      'post',
      `/v1/platform/tenants/${OPERATOR_TENANT_ID}/suspend`,
      op.session,
      { body: { reason: 'Prueba de protección de la operadora.' }, version },
    );
    expect(response.status).toBe(422);
    expect(errorCode(response)).toBe('TENANCY_OPERATOR_PROTECTED');
  });
});

describe('suspensión', () => {
  it('pedir la eliminación exige suspensión, el NIT correcto y una exportación', async () => {
    const op = await operator(s, 'operador-eliminacion');
    const tenantId = await freshTenant('sin-exportar');
    const path = `/v1/platform/tenants/${tenantId}/deletion`;
    const reason = 'La empresa pidió cerrar su cuenta.';
    const active = await card(s, op, tenantId);
    const notSuspended = await sendAs(s, 'post', path, op.session, {
      body: { reason, confirm_tax_id: active.tax_id },
      version: active.version,
    });
    expect(notSuspended.status).toBe(409);
    await sendAs(s, 'post', `/v1/platform/tenants/${tenantId}/suspend`, op.session, {
      body: { reason },
      version: active.version,
    });
    const suspended = await card(s, op, tenantId);
    const wrongNit = await sendAs(s, 'post', path, op.session, {
      body: { reason, confirm_tax_id: '900000001-1' },
      version: suspended.version,
    });
    expect(errorCode(wrongNit)).toBe('TENANCY_TAX_ID_MISMATCH');
    const noExport = await sendAs(s, 'post', path, op.session, {
      body: { reason, confirm_tax_id: suspended.tax_id },
      version: suspended.version,
    });
    expect(noExport.status).toBe(422);
    expect(errorCode(noExport)).toBe('TENANCY_EXPORT_REQUIRED');
  });
});

describe('versiones y empresas inexistentes', () => {
  it('suspender con una versión vieja no cambia nada y una empresa inexistente no existe', async () => {
    const op = await operator(s, 'operador-versiones');
    const tenantId = await freshTenant('version-vieja');
    const { version } = await card(s, op, tenantId);
    const path = `/v1/platform/tenants/${tenantId}/suspend`;
    const body = { reason: 'Prueba de versión vieja del operador.' };
    const stale = await sendAs(s, 'post', path, op.session, { body, version: version + 5 });
    expect(stale.status).toBe(409);
    expect((await card(s, op, tenantId)).status).toBe('active');
    const missing = '01900000-0000-7000-8000-00000000dead';
    const deletion = await sendAs(
      s,
      'post',
      `/v1/platform/tenants/${missing}/deletion`,
      op.session,
      {
        body: { reason: 'Empresa que no existe en la plataforma.', confirm_tax_id: '900123456-8' },
        version: 1,
      },
    );
    expect(deletion.status).toBe(404);
    expect(errorCode(deletion)).toBe('TENANCY_TENANT_NOT_FOUND');
  });
});
