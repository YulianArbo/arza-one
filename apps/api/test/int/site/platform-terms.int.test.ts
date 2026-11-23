import { platformTermsStatusSchema, sessionResponseSchema } from '@arza/contracts';
import { expect, it } from 'vitest';

import { signIn, type SignedIn } from '../iam/support/iam-fixtures.js';
import { SiteScenario } from './support/site-scenario.js';

// Términos de uso de la plataforma (B41, decisión 3; ficha 17.18): publicar una nueva versión
// obliga a aceptarla en el siguiente ingreso. Es el único archivo que los publica en su empresa:
// después de publicarlos, todo ingreso nuevo de esa empresa espera la aceptación.

const scenario = new SiteScenario('sitio terminos de la plataforma');

/** Evidencia de la aceptación y su evento de auditoría. */
async function expectEvidence(textId: string, userId: string): Promise<void> {
  const evidence = await scenario.inTenant((tx) =>
    tx.webLegalAcceptance.findMany({ where: { textId, userId } }),
  );
  expect(evidence).toHaveLength(1);
  expect(evidence[0]?.acceptedAt).toBeInstanceOf(Date);
  const audit = await scenario.inTenant((tx) =>
    tx.auditEvent.count({ where: { action: 'web.platform_terms.accept', actorId: userId } }),
  );
  expect(audit).toBe(1);
}

/** Lee los términos pendientes, rechaza una versión que no es la vigente y acepta la vigente. */
async function acceptPending(session: SignedIn, textId: string): Promise<void> {
  const status = platformTermsStatusSchema.parse(
    (await scenario.get('/v1/me/platform-terms', session)).body,
  );
  expect(status).toMatchObject({ pending: true, terms: { id: textId, version_number: 1 } });
  const wrong = await scenario.post('/v1/me/platform-terms/accept', session, {
    text_id: '01900000-0000-7000-8000-000000000001',
  });
  expect(wrong.status).toBe(409);
  const accepted = await scenario.post('/v1/me/platform-terms/accept', session, {
    text_id: textId,
  });
  expect(accepted.status, accepted.text).toBe(204);
}

it('sin versión publicada nadie queda esperando; al publicarla, el siguiente ingreso la pide', async () => {
  const [officer, director, sales] = await Promise.all([
    scenario.person('oficial', ['OFICIAL_DATOS']),
    scenario.person('direccion', ['DIRECCION']),
    scenario.person('comercial', ['COMERCIAL']),
  ]);
  const before = platformTermsStatusSchema.parse(
    (await scenario.get('/v1/me/platform-terms', sales.session)).body,
  );
  expect(before).toEqual({ pending: false, terms: null });
  const textId = await scenario.publishText('platform_terms', {
    drafter: officer,
    approver: director,
  });
  // La sesión abierta antes de publicar sigue trabajando: se pide en el siguiente ingreso.
  expect((await scenario.get('/v1/site/submissions', sales.session)).status).toBe(200);
  const fresh = await signIn(scenario.app, sales.email);
  expect(sessionResponseSchema.parse(fresh.session).terms_pending).toBe(true);
  const blocked = await scenario.get('/v1/site/submissions', fresh);
  expect(blocked.status).toBe(403);
  expect(blocked.body).toMatchObject({ error: { code: 'TERMS_PENDING' } });
  await acceptPending(fresh, textId);
  expect((await scenario.get('/v1/site/submissions', fresh)).status).toBe(200);
  const later = await signIn(scenario.app, sales.email);
  expect(sessionResponseSchema.parse(later.session).terms_pending).toBe(false);
  await expectEvidence(textId, sales.id);
});
