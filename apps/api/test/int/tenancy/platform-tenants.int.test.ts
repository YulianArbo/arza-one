import { tenantCreatedResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { OPERATOR_TENANT_ID } from '../../../src/platform/database/operator-tenant.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import { errorCode, tenantScope, uniqueEmail } from '../iam/support/iam-fixtures.js';
import { connect, integrationDatabase } from '../support/integration-database.js';
import {
  actionsIn,
  card,
  freshNit,
  operator,
  sendAs,
  tenantCards,
} from './support/tenancy-fixture.js';

// Empresas de la plataforma (B48): solo el operador, desde la empresa operadora, las administra y
// las da de alta; la base de datos lo impide aunque el código se equivoque.

const s = new AccessScenario('multiempresa');

describe('quién administra las empresas', () => {
  it('el operador ve la ficha de cada empresa, sin su contenido', async () => {
    const op = await operator(s);
    const cards = await tenantCards(s, op);
    const mine = cards.find((entry) => entry.id === s.tenant.id);
    expect(mine?.status).toBe('active');
    expect(mine?.plan).toBe('professional');
    expect(mine?.usage?.internal_users).toBeGreaterThanOrEqual(0);
    expect(cards.find((entry) => entry.id === OPERATOR_TENANT_ID)?.is_operator).toBe(true);
    expect(Object.keys(mine ?? {})).not.toContain('settings');
  });
});

describe('quién administra las empresas', () => {
  it('el administrador de una empresa no ve ni crea empresas (permiso denegado)', async () => {
    const admin = await s.person('admin-sin-plataforma', ['ADMIN_PLATAFORMA', 'DIRECCION']);
    expect((await s.get('/v1/platform/tenants', admin.session)).status).toBe(403);
    const body = {
      legal_name: 'Intrusa S.A.S.',
      trade_name: null,
      tax_id: freshNit(),
      plan: 'basic',
      admin: { email: uniqueEmail('intrusa'), display_name: 'Ana Intrusa' },
    };
    const created = await sendAs(s, 'post', '/v1/platform/tenants', admin.session, { body });
    expect(created.status).toBe(403);
  });
});

describe('quién administra las empresas', () => {
  it('el rol de operador no existe fuera de la empresa operadora', async () => {
    const role = await tenantScope(
      s.db,
      s.tenant.id,
    )((tx) => tx.role.findFirst({ where: { code: 'OPERADOR_PLATAFORMA' } }));
    expect(role).toBeNull();
  });
});

describe('quién administra las empresas', () => {
  it('la base de datos rechaza las funciones de la plataforma fuera de la empresa operadora', async () => {
    const client = await connect(integrationDatabase().appUrl);
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [s.tenant.id]);
      await expect(client.query('SELECT * FROM core_platform_tenants()')).rejects.toThrow(
        'TENANCY_OPERATOR_ONLY',
      );
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});

describe('quién administra las empresas', () => {
  it('una empresa no se cambia a sí misma el plan ni el estado', async () => {
    const client = await connect(integrationDatabase().appUrl);
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [s.tenant.id]);
      await expect(
        client.query("UPDATE core_tenants SET plan = 'enterprise', limit_internal_users = NULL"),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
    const other = await connect(integrationDatabase().appUrl);
    try {
      await other.query('BEGIN');
      await other.query("SELECT set_config('app.tenant_id', $1, true)", [s.tenant.id]);
      await expect(other.query("UPDATE core_tenants SET status = 'active'")).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await other.query('ROLLBACK');
      await other.end();
    }
  });
});

describe('alta de una empresa', () => {
  it('crea la empresa con sus roles e invita a su primer administrador', async () => {
    const op = await operator(s, 'operador-alta');
    const email = uniqueEmail('primer-admin');
    const body = {
      legal_name: 'Cliente Nuevo S.A.S.',
      trade_name: 'Cliente Nuevo',
      tax_id: freshNit(),
      plan: 'basic',
      admin: { email, display_name: 'Pedro Administrador' },
    };
    const response = await sendAs(s, 'post', '/v1/platform/tenants', op.session, { body });
    expect(response.status, response.text).toBe(201);
    const { id, admin_user_id: adminId } = tenantCreatedResponseSchema.parse(response.body);
    const created = await card(s, op, id);
    expect(created.plan).toBe('basic');
    expect(created.limits.max_internal_users).toBe(10);
    const admin = await tenantScope(
      s.db,
      id,
    )((tx) =>
      tx.user.findUniqueOrThrow({
        where: { id: adminId },
        include: { roleAssignments: { include: { role: true } } },
      }),
    );
    expect(admin.status).toBe('invited');
    expect(admin.roleAssignments.map((entry) => entry.role.code)).toContain('ADMIN_PLATAFORMA');
    expect(await actionsIn(s, OPERATOR_TENANT_ID)).toContain('platform.tenant.create');
    expect(await actionsIn(s, id)).toContain('core.tenant.create');
  });
});

describe('alta de una empresa', () => {
  it('rechaza un NIT repetido, un dígito de verificación errado y un correo con cuenta', async () => {
    const op = await operator(s, 'operador-rechazos');
    const base = {
      legal_name: 'Repetida S.A.S.',
      trade_name: null,
      plan: 'basic',
      admin: { email: uniqueEmail('repetida'), display_name: 'Rosa Repetida' },
    };
    const nit = freshNit();
    const first = await sendAs(s, 'post', '/v1/platform/tenants', op.session, {
      body: { ...base, tax_id: nit },
    });
    expect(first.status, first.text).toBe(201);
    const again = await sendAs(s, 'post', '/v1/platform/tenants', op.session, {
      body: { ...base, tax_id: nit, admin: { ...base.admin, email: uniqueEmail('otra') } },
    });
    expect(again.status).toBe(409);
    const [number, digit] = freshNit().split('-');
    const wrongDigit = `${number ?? ''}-${String((Number(digit) + 1) % 10)}`;
    const invalid = await sendAs(s, 'post', '/v1/platform/tenants', op.session, {
      body: { ...base, tax_id: wrongDigit },
    });
    expect(invalid.status).toBe(422);
    const taken = await sendAs(s, 'post', '/v1/platform/tenants', op.session, {
      body: { ...base, tax_id: freshNit(), admin: { ...base.admin, email: op.email } },
    });
    expect(taken.status).toBe(409);
    expect(errorCode(taken)).toBe('EMAIL_TAKEN');
  });
});
