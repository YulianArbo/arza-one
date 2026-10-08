import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DatabaseService } from '../../../src/platform/database/database.service.js';
import type { TenantTransaction } from '../../../src/platform/database/tenant-context.js';
import {
  createDatabaseService,
  createTenant,
  newTestTenant,
} from '../support/integration-database.js';
import {
  HOUR,
  ManualClock,
  WEB_ORIGIN,
  createIamTestApp,
  createUser,
  errorCode,
  logout,
  profileOf,
  signIn,
  tenantScope,
  uniqueEmail,
} from './support/iam-fixtures.js';

// Cierre y vencimiento de las sesiones (numeral 15.1): 8 horas sin uso, 12 en total.

const tenant = newTestTenant('sesiones');
const clock = new ManualClock();
let database: DatabaseService;
let app: NestExpressApplication;

beforeAll(async () => {
  database = createDatabaseService();
  await createTenant(database, tenant);
  app = await createIamTestApp(clock);
});

afterAll(async () => {
  await app.close();
  await database.onModuleDestroy();
});

function inTenant<T>(work: (tx: TenantTransaction) => Promise<T>): Promise<T> {
  return tenantScope(database, tenant.id)(work);
}

async function signedInUser(label: string) {
  const email = uniqueEmail(label);
  const id = await createUser(database, { tenantId: tenant.id, email });
  return { id, email, ...(await signIn(app, email)) };
}

describe('cerrar sesión exige el código antifalsificación (permiso denegado)', () => {
  it('sin código se rechaza', async () => {
    const { cookie } = await signedInUser('sin-codigo');
    const response = await logout(app, cookie, {});
    expect(response.status).toBe(403);
    expect(errorCode(response)).toBe('CSRF_INVALID');
  });

  it('desde otro sitio se rechaza aunque traiga el código', async () => {
    const { cookie, session } = await signedInUser('otro-sitio');
    const response = await logout(app, cookie, {
      origin: 'https://sitio-ajeno.test',
      csrf: session.csrf_token,
    });
    expect(response.status).toBe(403);
  });

  it('el código de otra sesión no sirve', async () => {
    const first = await signedInUser('cruzado');
    const second = await signIn(app, first.email);
    const response = await logout(app, first.cookie, { csrf: second.session.csrf_token });
    expect(response.status).toBe(403);
  });
});

describe('cerrar sesión', () => {
  it('borra la cookie y la sesión deja de servir', async () => {
    const { cookie, session } = await signedInUser('salida');
    const response = await logout(app, cookie, { origin: WEB_ORIGIN, csrf: session.csrf_token });
    expect(response.status).toBe(204);
    expect(String(response.headers['set-cookie'])).toMatch(/__Host-arza_session=;/);
    expect(await profileOf(app, cookie)).toBeNull();
  });
});

describe('vencimiento de la sesión', () => {
  it('vence a las 8 horas sin uso y queda cerrada con motivo de inactividad', async () => {
    const { id, cookie } = await signedInUser('inactiva');
    clock.advance(8 * HOUR);
    expect(await profileOf(app, cookie)).toBeNull();
    const sessions = await inTenant((tx) => tx.session.findMany({ where: { userId: id } }));
    expect(sessions.map((session) => session.revokedReason)).toEqual(['idle']);
  });

  it('vence a las 12 horas en total aunque se use sin parar', async () => {
    const { cookie } = await signedInUser('total');
    clock.advance(7 * HOUR);
    expect(await profileOf(app, cookie)).not.toBeNull();
    clock.advance(5 * HOUR);
    expect(await profileOf(app, cookie)).toBeNull();
  });

  it('una cuenta desactivada pierde el acceso de inmediato', async () => {
    const { id, cookie } = await signedInUser('retiro');
    await inTenant((tx) => tx.user.update({ where: { id }, data: { status: 'inactive' } }));
    expect(await profileOf(app, cookie)).toBeNull();
  });
});
