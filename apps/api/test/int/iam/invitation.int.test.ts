import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { InvitationUseCase } from '../../../src/modules/iam/application/invitation.js';
import { prepareAccountEmail } from '../../../src/modules/iam/index.js';
import type { DatabaseService } from '../../../src/platform/database/database.service.js';
import type { TenantTransaction } from '../../../src/platform/database/tenant-context.js';
import {
  createDatabaseService,
  createTenant,
  newTestTenant,
} from '../support/integration-database.js';
import {
  APP_URL,
  GOOD_PASSWORD,
  HOUR,
  ManualClock,
  accountEmailJob,
  accountEmailJobs,
  auditActions,
  createIamTestApp,
  createUser,
  errorCode,
  linkTokenFromEmail,
  postFromWeb,
  signIn,
  tenantScope,
  uniqueEmail,
} from './support/iam-fixtures.js';

// Alta solo por invitación (numeral 15.1): enlace de un solo uso que vence en 72 horas.

const tenant = newTestTenant('invitación');
const otherTenant = newTestTenant('invitación, otra empresa');
const clock = new ManualClock();
let database: DatabaseService;
let app: NestExpressApplication;
let invitations: InvitationUseCase;

beforeAll(async () => {
  database = createDatabaseService();
  await createTenant(database, tenant);
  await createTenant(database, otherTenant);
  app = await createIamTestApp(clock);
  invitations = app.get(InvitationUseCase);
});

afterAll(async () => {
  await app.close();
  await database.onModuleDestroy();
});

function inTenant<T>(work: (tx: TenantTransaction) => Promise<T>): Promise<T> {
  return tenantScope(database, tenant.id)(work);
}

function inviteInto(tenantId: string, email: string, kind: 'internal' | 'portal' = 'internal') {
  return invitations.invite({ tenantId, email, kind, displayName: null });
}

async function invite(email: string): Promise<string> {
  await inviteInto(tenant.id, email);
  const user = await inTenant((tx) => tx.user.findUniqueOrThrow({ where: { email } }));
  return user.id;
}

function accept(token: string, password = GOOD_PASSWORD) {
  return postFromWeb(app, '/v1/auth/invitation/accept', {
    token,
    password,
    display_name: 'Ana Pérez',
  });
}

async function invitationToken(userId: string): Promise<string> {
  return linkTokenFromEmail(database, clock, accountEmailJob(tenant.id, userId, 'invitation'));
}

function invitationEmail(userId: string) {
  const job = accountEmailJob(tenant.id, userId, 'invitation');
  return prepareAccountEmail(job, { database, clock, appUrl: APP_URL });
}

describe('invitar a una persona', () => {
  it('crea la cuenta invitada, la audita y encola el correo', async () => {
    const userId = await invite(uniqueEmail('invitada'));
    const user = await inTenant((tx) => tx.user.findUniqueOrThrow({ where: { id: userId } }));
    expect(user).toMatchObject({ status: 'invited', passwordHash: null, kind: 'internal' });
    expect(await accountEmailJobs(userId, 'invitation')).toHaveLength(1);
    // Desde B10, toda persona interna recibe el rol COLABORADOR al ser invitada.
    expect(await auditActions(database, tenant.id, userId)).toEqual([
      'iam.user.invite:success',
      'iam.role.assign:success',
    ]);
  });

  it('el correo lleva a la página de activación con la llave después de #', async () => {
    const userId = await invite(uniqueEmail('correo'));
    const email = await invitationEmail(userId);
    expect(email?.subject).toBe('Invitación a ARZA ONE');
    expect(email?.text).toMatch(/http:\/\/localhost:3000\/activar-cuenta#token=[\w-]{43}/);
    expect(email?.text).toMatch(/vence el \d{2}\/\d{2}\/\d{4}/);
    const tokens = await inTenant((tx) => tx.token.findMany({ where: { userId } }));
    expect(tokens).toHaveLength(1);
    expect(email?.text).not.toContain(tokens[0]?.tokenHash);
  });

  it('volver a invitar reenvía la invitación pendiente', async () => {
    const email = uniqueEmail('reenvio');
    const userId = await invite(email);
    await expect(inviteInto(tenant.id, email)).resolves.toEqual({ userId, outcome: 'resent' });
    expect(await accountEmailJobs(userId, 'invitation')).toHaveLength(2);
    // B11: el reenvío también queda auditado.
    expect(await auditActions(database, tenant.id, userId)).toEqual([
      'iam.user.invite:success',
      'iam.role.assign:success',
      'iam.user.invite:success',
    ]);
  });
});

describe('invitaciones que no proceden', () => {
  it('no invita de nuevo a quien ya activó su cuenta', async () => {
    const email = uniqueEmail('ya-activa');
    await createUser(database, { tenantId: tenant.id, email });
    await expect(inviteInto(tenant.id, email, 'portal')).rejects.toMatchObject({
      code: 'EMAIL_TAKEN',
      status: 409,
    });
  });

  it('no invita un correo que ya tiene cuenta en otra empresa', async () => {
    const email = uniqueEmail('ocupado');
    await createUser(database, { tenantId: otherTenant.id, email });
    await expect(inviteInto(tenant.id, email)).rejects.toThrow(
      'Ya existe una cuenta con ese correo.',
    );
  });

  it('no invita en una empresa que no existe', async () => {
    const missing = newTestTenant('inexistente');
    await expect(inviteInto(missing.id, uniqueEmail('sin-empresa'))).rejects.toThrow();
  });

  it('una cuenta ya activa no recibe correo de invitación', async () => {
    const userId = await createUser(database, {
      tenantId: tenant.id,
      email: uniqueEmail('activa'),
    });
    expect(await invitationEmail(userId)).toBeNull();
  });
});

describe('activar la cuenta con el enlace', () => {
  it('activa la cuenta con la contraseña elegida y la audita', async () => {
    const userId = await invite(uniqueEmail('activar'));
    expect((await accept(await invitationToken(userId))).status).toBe(204);
    const user = await inTenant((tx) => tx.user.findUniqueOrThrow({ where: { id: userId } }));
    expect(user).toMatchObject({ status: 'active', displayName: 'Ana Pérez' });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await auditActions(database, tenant.id, userId)).toContain(
      'iam.invitation.accept:success',
    );
  });

  it('después de activarla, la persona inicia sesión', async () => {
    const email = uniqueEmail('primer-ingreso');
    await accept(await invitationToken(await invite(email)));
    const { session } = await signIn(app, email);
    expect(session.user.display_name).toBe('Ana Pérez');
  });
});

describe('el enlace de invitación', () => {
  it('sirve una sola vez', async () => {
    const token = await invitationToken(await invite(uniqueEmail('reuso')));
    expect((await accept(token)).status).toBe(204);
    expect(errorCode(await accept(token, 'otra frase propia y larga'))).toBe('LINK_INVALID');
  });

  it('vence a las 72 horas', async () => {
    const token = await invitationToken(await invite(uniqueEmail('vence')));
    clock.advance(72 * HOUR);
    expect(errorCode(await accept(token))).toBe('LINK_INVALID');
  });

  it('rechaza contraseñas cortas o filtradas sin gastarse', async () => {
    const token = await invitationToken(await invite(uniqueEmail('reglas')));
    expect(errorCode(await accept(token, 'corta'))).toBe('PASSWORD_TOO_SHORT');
    expect(errorCode(await accept(token, 'qwertyuiopasdfghjkl'))).toBe('PASSWORD_BREACHED');
    expect((await accept(token)).status).toBe(204);
  });

  it('un enlace de recuperación no sirve para activar una cuenta', async () => {
    const userId = await createUser(database, {
      tenantId: tenant.id,
      email: uniqueEmail('proposito'),
    });
    const job = accountEmailJob(tenant.id, userId, 'password_reset');
    const resetToken = await linkTokenFromEmail(database, clock, job);
    expect(errorCode(await accept(resetToken))).toBe('LINK_INVALID');
  });
});
