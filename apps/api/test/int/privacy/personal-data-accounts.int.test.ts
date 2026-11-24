import {
  createdResponseSchema,
  erasureResultSchema,
  personalDataReportSchema,
} from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import type { Person } from '../iam/support/access-scenario.js';
import { RequestScenario, REQUESTS } from './support/request-scenario.js';

// Lo que Privacidad misma guarda del titular (B42, decisión 8): la entrega muestra sus
// autorizaciones, también las revocadas, y su cuenta del portal; al suprimir, la cuenta inactiva
// del portal queda anónima y las autorizaciones se conservan como prueba. Datos ficticios.

const scenario = new RequestScenario('privacidad cuentas del titular');

/** Titular con una autorización revocada y una cuenta del portal ya desactivada. */
async function holderWithAccount(dpo: Person): Promise<{ partyId: string; userId: string }> {
  const partyId = await scenario.holder();
  const client = await scenario.person('portal-inactivo', ['CLIENTE_USUARIO'], { kind: 'portal' });
  await scenario.inTenant(async (tx) => {
    await tx.user.update({ where: { id: client.id }, data: { partyId, status: 'inactive' } });
    await tx.privacyConsent.updateMany({
      where: { partyId },
      data: {
        revokedAt: scenario.clock.now(),
        revokedBy: dpo.id,
        revocationReason: 'El titular la retiró.',
      },
    });
  });
  return { partyId, userId: client.id };
}

async function exportData(dpo: Person, partyId: string, requestId: string) {
  const created = await scenario.post(`/v1/parties/${partyId}/personal-data/export`, dpo.session, {
    request_id: requestId,
  });
  expect(created.status, created.text).toBe(201);
  const exportId = createdResponseSchema.parse(created.body).id;
  const data = await scenario.get(`${REQUESTS}/${requestId}/exports/${exportId}/data`, dpo.session);
  return personalDataReportSchema.parse(data.body);
}

describe('entrega de los datos', () => {
  it('muestra la autorización revocada y la cuenta del portal', async () => {
    const dpo = await scenario.officer();
    const { partyId } = await holderWithAccount(dpo);
    const requestId = await scenario.verified(dpo, partyId);
    const report = await exportData(dpo, partyId, requestId);
    const consents = report.sections.find((section) => section.key === 'a-consents');
    const state = consents?.records[0]?.fields.find((field) => field.label === 'Estado');
    expect(state?.value).toMatch(/^Revocada el /u);
    const accounts = report.sections.find((section) => section.key === 'c-accounts');
    expect(accounts?.records.map((record) => record.title)).toEqual([
      'Cuenta del portal del cliente',
    ]);
  });
});

describe('supresión', () => {
  it('la cuenta inactiva del portal queda anónima', async () => {
    const dpo = await scenario.officer();
    const { partyId, userId } = await holderWithAccount(dpo);
    const requestId = await scenario.verified(dpo, partyId, { right: 'erase' });
    const response = await scenario.post(
      `/v1/parties/${partyId}/personal-data/erase`,
      dpo.session,
      {
        request_id: requestId,
      },
    );
    expect(response.status, response.text).toBe(200);
    const result = erasureResultSchema.parse(response.body);
    const outcome = (key: string) => result.sections.find((section) => section.key === key);
    expect(outcome('c-accounts')?.outcome).toBe('erased');
    expect(outcome('a-consents')?.outcome).toBe('kept');
    const detail = await scenario.privacyRequest(dpo, requestId);
    expect(detail.erasure?.sections.map((section) => section.key)).toContain('c-accounts');
    const user = await scenario.inTenant((tx) =>
      tx.user.findUniqueOrThrow({ where: { id: userId } }),
    );
    expect([user.email, user.displayName]).toEqual([
      `suprimido-${userId}@titular.invalid`,
      'Titular suprimido',
    ]);
  });
});
