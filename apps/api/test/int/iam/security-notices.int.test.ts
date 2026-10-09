import { recoveryCodesResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { prepareAccountEmail } from '../../../src/modules/iam/index.js';
import {
  APP_URL,
  accountEmailJob,
  accountEmailJobs,
  createUser,
  postWithSession,
  signIn,
  signInWithPassword,
  uniqueEmail,
} from './support/iam-fixtures.js';
import { IamScenario } from './support/iam-scenario.js';

// Avisos de seguridad por correo (B09, «Eventos y alertas de seguridad») y códigos de
// recuperación nuevos desde el perfil.

const scenario = new IamScenario('avisos');

const NOTICES = [
  ['mfa_enabled', 'Activó el segundo factor en ARZA ONE'],
  ['mfa_changed', 'Cambió el celular de su segundo factor en ARZA ONE'],
  ['mfa_disabled', 'Desactivó el segundo factor en ARZA ONE'],
  ['mfa_reset', 'Se reinició el segundo factor de su cuenta de ARZA ONE'],
  ['recovery_codes_regenerated', 'Generó códigos de recuperación nuevos en ARZA ONE'],
  ['recovery_code_used', 'Usó un código de recuperación en ARZA ONE'],
  ['new_device', 'Nuevo inicio de sesión en su cuenta de ARZA ONE'],
] as const;

function prepare(job: Parameters<typeof prepareAccountEmail>[0]) {
  return prepareAccountEmail(job, {
    database: scenario.db,
    clock: scenario.clock,
    appUrl: APP_URL,
  });
}

describe('avisos de seguridad por correo', () => {
  it.each(NOTICES)(
    '«%s» dice qué pasó, cuándo en hora de Colombia y qué hacer',
    async (purpose, subject) => {
      const { email, id } = await scenario.newUser(`aviso-${purpose}`);
      const job = {
        ...accountEmailJob(scenario.tenant.id, id, purpose),
        occurredAt: '2026-10-09T20:30:00.000Z',
      };
      const prepared = await prepare(job);
      expect(prepared).toMatchObject({ to: email, subject });
      expect(prepared?.text).toContain('09/10/2026, 3:30');
      expect(prepared?.text).toContain('responsable técnico');
      expect(prepared?.text).not.toMatch(/[A-Z2-7]{32}|([A-Z2-9]{4}-){3}/);
    },
  );

  it('a una cuenta inactiva no se le envía nada', async () => {
    const email = uniqueEmail('aviso-inactiva');
    const tenantId = scenario.tenant.id;
    const id = await createUser(scenario.db, { tenantId, email, status: 'inactive' });
    expect(await prepare(accountEmailJob(tenantId, id, 'mfa_enabled'))).toBeNull();
  });
});

describe('códigos de recuperación nuevos', () => {
  it('reemplazan a los anteriores y avisan cada vez', async () => {
    const { email, id } = await scenario.newUser('reemplazo');
    const signedIn = await signIn(scenario.app, email);
    const regenerate = () => postWithSession(scenario.app, '/v1/me/mfa/recovery-codes', signedIn);
    const older = recoveryCodesResponseSchema.parse((await regenerate()).body).recovery_codes;
    expect(older).toHaveLength(10);
    const newer = recoveryCodesResponseSchema.parse((await regenerate()).body).recovery_codes;
    const pending = await signInWithPassword(scenario.app, email);
    const verify = (code: string | undefined) =>
      postWithSession(scenario.app, '/v1/auth/mfa/verify', pending, { recovery_code: code });
    expect((await verify(older[0])).status).toBe(422);
    expect((await verify(newer[0])).status).toBe(200);
    expect(await accountEmailJobs(id, 'recovery_codes_regenerated')).toHaveLength(2);
  });
});
