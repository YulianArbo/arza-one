import { activeSessionsResponseSchema } from '@arza/contracts';
import type request from 'supertest';

import { totpCodeAt } from '../../../../src/modules/iam/infrastructure/totp.js';
import type { AccessScenario } from '../../iam/support/access-scenario.js';
import {
  GOOD_PASSWORD,
  accountEmailJob,
  createUser,
  currentCode,
  linkTokenFromEmail,
  postFromWeb,
  postWithSession,
  signIn,
  signInWithPassword,
  uniqueEmail,
} from '../../iam/support/iam-fixtures.js';

/** La petición va dentro de un objeto: una función async que la devolviera sola la enviaría. */
interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

function final(test: request.Test): PendingRequest {
  return { test };
}

const NEW_PASSWORD = 'arepa de choclo con queso';

/** Cuenta del portal sin segundo factor: entra solo con la contraseña. */
async function portalUser(scenario: AccessScenario, withSecondFactor = false) {
  return scenario.newUser('portal', { kind: 'portal', withSecondFactor });
}

async function userWithStatus(scenario: AccessScenario, status: 'invited' | 'locked') {
  const email = uniqueEmail(status);
  const id = await createUser(scenario.db, { tenantId: scenario.tenant.id, email, status });
  return { email, id };
}

async function linkToken(
  scenario: AccessScenario,
  userId: string,
  purpose: 'invitation' | 'password_reset',
): Promise<string> {
  const job = accountEmailJob(scenario.tenant.id, userId, purpose);
  return linkTokenFromEmail(scenario.clock, job);
}

async function otherSessionId(scenario: AccessScenario, email: string) {
  const first = await signIn(scenario.app, email);
  await signIn(scenario.app, email);
  const list = activeSessionsResponseSchema.parse(
    (await scenario.get('/v1/me/sessions', first)).body,
  );
  return { first, id: list.data.find((session) => !session.current)?.id ?? '' };
}

const AUTH_CALLS: Record<string, RouteCall> = {
  'POST /v1/auth/login': async (s) => {
    const { email } = await portalUser(s);
    return final(postFromWeb(s.app, '/v1/auth/login', { email, password: GOOD_PASSWORD }));
  },
  'POST /v1/auth/mfa/verify': async (s) => {
    const { email } = await s.newUser('segundo-paso');
    const pending = await signInWithPassword(s.app, email);
    return final(
      postWithSession(s.app, '/v1/auth/mfa/verify', pending, {
        code: currentCode(email, s.clock),
      }),
    );
  },
  'POST /v1/auth/mfa/setup': async (s) => {
    const { email } = await s.newUser('configura', { withSecondFactor: false });
    return final(
      postWithSession(s.app, '/v1/auth/mfa/setup', await signInWithPassword(s.app, email)),
    );
  },
  'POST /v1/auth/mfa/setup/confirm': async (s) => {
    const { email } = await s.newUser('confirma', { withSecondFactor: false });
    const pending = await signInWithPassword(s.app, email);
    const setup = await s.startSetup(pending);
    const code = totpCodeAt(setup.secret, s.clock.now());
    return final(postWithSession(s.app, '/v1/auth/mfa/setup/confirm', pending, { code }));
  },
  'POST /v1/auth/reauthenticate': async (s) => {
    const session = await signIn(s.app, (await portalUser(s)).email);
    return final(
      postWithSession(s.app, '/v1/auth/reauthenticate', session, { password: GOOD_PASSWORD }),
    );
  },
  'POST /v1/auth/logout': async (s) => {
    const session = await signIn(s.app, (await portalUser(s)).email);
    return final(postWithSession(s.app, '/v1/auth/logout', session));
  },
  'POST /v1/auth/password/forgot': async (s) => {
    const { email } = await portalUser(s);
    return final(postFromWeb(s.app, '/v1/auth/password/forgot', { email }));
  },
  'POST /v1/auth/password/reset': async (s) => {
    const token = await linkToken(s, (await portalUser(s)).id, 'password_reset');
    return final(postFromWeb(s.app, '/v1/auth/password/reset', { token, password: NEW_PASSWORD }));
  },
  'POST /v1/auth/invitation/accept': async (s) => {
    const token = await linkToken(s, (await userWithStatus(s, 'invited')).id, 'invitation');
    return final(
      postFromWeb(s.app, '/v1/auth/invitation/accept', {
        token,
        password: GOOD_PASSWORD,
        display_name: 'Ana Pérez',
      }),
    );
  },
};

const ME_CALLS: Record<string, RouteCall> = {
  'POST /v1/me/password': async (s) => {
    const session = await signIn(s.app, (await portalUser(s)).email);
    return final(
      postWithSession(s.app, '/v1/me/password', session, {
        current_password: GOOD_PASSWORD,
        new_password: NEW_PASSWORD,
      }),
    );
  },
  'POST /v1/me/mfa/recovery-codes': async (s) => {
    const session = await signIn(s.app, (await s.newUser('codigos')).email);
    return final(postWithSession(s.app, '/v1/me/mfa/recovery-codes', session));
  },
  'POST /v1/me/mfa/disable': async (s) => {
    const session = await signIn(s.app, (await portalUser(s, true)).email);
    return final(postWithSession(s.app, '/v1/me/mfa/disable', session));
  },
  'POST /v1/me/sessions/revoke-others': async (s) => {
    const { first } = await otherSessionId(s, (await portalUser(s)).email);
    return final(postWithSession(s.app, '/v1/me/sessions/revoke-others', first));
  },
  'POST /v1/me/sessions/{id}/revoke': async (s) => {
    const { first, id } = await otherSessionId(s, (await portalUser(s)).email);
    return final(postWithSession(s.app, `/v1/me/sessions/${id}/revoke`, first));
  },
};

export const AUTH_ROUTE_CALLS: Readonly<Record<string, RouteCall>> = {
  ...AUTH_CALLS,
  ...ME_CALLS,
};
