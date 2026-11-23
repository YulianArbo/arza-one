import {
  cookieConsentListResponseSchema,
  privacyIncidentListResponseSchema,
} from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { INCIDENTS, RequestScenario, REQUESTS } from './support/request-scenario.js';

// Consultas del Oficial (B42): lo que no existe responde «no existe», un incidente cerrado ya no
// cambia de estado, la lista de incidentes se filtra por estado y la de cookies pasa de página.
// Datos ficticios.

const scenario = new RequestScenario('privacidad consultas del oficial');

describe('lo que no existe', () => {
  it('una entrega o un incidente inexistentes responden «no existe»', async () => {
    const dpo = await scenario.officer();
    const requestId = await scenario.verified(dpo, await scenario.holder());
    const missing = uuidv7();
    for (const kind of ['pdf', 'data']) {
      const path = `${REQUESTS}/${requestId}/exports/${missing}/${kind}`;
      expect(errorCode(await scenario.get(path, dpo.session)), path).toBe(
        'PRIVACY_REQUEST_NOT_FOUND',
      );
    }
    const incident = await scenario.get(`${INCIDENTS}/${missing}`, dpo.session);
    expect(errorCode(incident)).toBe('PRIVACY_INCIDENT_NOT_FOUND');
  });
});

describe('incidentes', () => {
  it('cerrado ya no se contiene, y la lista se filtra por estado', async () => {
    const dpo = await scenario.officer();
    const closed = await scenario.incident(dpo);
    const reason = { not_reportable_reason: 'El archivo se recuperó sin abrirse; no hubo riesgo.' };
    const close = await scenario.act(
      `${INCIDENTS}/${closed}/actions/close`,
      dpo.session,
      1,
      reason,
    );
    expect(close.status, close.text).toBe(204);
    const contain = await scenario.act(`${INCIDENTS}/${closed}/actions/contain`, dpo.session, 2, {
      note: 'Se cambió la contraseña de la cuenta.',
    });
    expect(errorCode(contain)).toBe('PRIVACY_INCIDENT_STEP_INVALID');
    const open = await scenario.incident(dpo);
    const list = await scenario.get(`${INCIDENTS}?status=closed`, dpo.session);
    const ids = privacyIncidentListResponseSchema.parse(list.body).data.map((row) => row.id);
    expect(ids).toContain(closed);
    expect(ids).not.toContain(open);
  });
});

describe('cookies', () => {
  it('la lista pasa de página', async () => {
    const dpo = await scenario.officer();
    await scenario.inTenant(async (tx) => {
      for (const categories of [['necessary'], ['necessary', 'analytics']]) {
        await tx.privacyCookieConsent.create({
          data: {
            tenantId: scenario.tenant.id,
            visitorId: uuidv7(),
            policyVersion: 1,
            categories,
            decidedAt: scenario.clock.now(),
            ipTruncated: '10.0.0.0',
          },
        });
      }
    });
    const day = scenario.today();
    const base = `/v1/privacy/cookie-consents?from=${day}&to=${day}&limit=1`;
    const first = cookieConsentListResponseSchema.parse(
      (await scenario.get(base, dpo.session)).body,
    );
    expect(first.next_cursor).not.toBeNull();
    const next = await scenario.get(`${base}&cursor=${String(first.next_cursor)}`, dpo.session);
    const second = cookieConsentListResponseSchema.parse(next.body);
    expect(second.data[0]?.id).not.toBe(first.data[0]?.id);
  });
});
