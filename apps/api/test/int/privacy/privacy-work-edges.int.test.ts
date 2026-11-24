import { createdResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { runPrivacyWork } from '../../../src/modules/privacy/index.js';
import type { Person } from '../iam/support/access-scenario.js';
import { RequestScenario } from './support/request-scenario.js';

// El worker de Privacidad (B42, decisiones 4 y 6): avisa al titular cuando se le pide completar el
// reclamo y cuando se amplía el plazo; sin correo, el aviso se atiende sin enviar nada; y si el PDF
// de la entrega no se puede preparar, lo reintenta y a los cinco intentos queda «No se pudo
// preparar», con cada intento en la auditoría. Datos ficticios.

const scenario = new RequestScenario('privacidad worker bordes');

async function requestedExport(dpo: Person): Promise<{ requestId: string; exportId: string }> {
  const partyId = await scenario.holder();
  const requestId = await scenario.verified(dpo, partyId);
  const created = await scenario.post(`/v1/parties/${partyId}/personal-data/export`, dpo.session, {
    request_id: requestId,
  });
  expect(created.status, created.text).toBe(201);
  return { requestId, exportId: createdResponseSchema.parse(created.body).id };
}

describe('correos al titular', () => {
  it('le pide completar el reclamo y le informa la prórroga', async () => {
    const dpo = await scenario.officer();
    const claimEmail = 'reclamo.worker@ejemplo.test';
    const claim = await scenario.fileInternal(dpo, {
      right: 'rectify',
      requester_email: claimEmail,
    });
    await scenario.step(dpo, claim, 'require', { text: 'Indique el dato correcto.' });
    const inquiryEmail = 'consulta.worker@ejemplo.test';
    const inquiry = await scenario.fileInternal(dpo, { requester_email: inquiryEmail });
    await scenario.step(dpo, inquiry, 'extend', { reason: 'Consultamos varios módulos.' });
    await scenario.work();
    const required = scenario
      .mailsTo(claimEmail)
      .find((mail) => mail.subject.startsWith('Necesitamos'));
    expect(required?.subject).toContain('Necesitamos completar su reclamo');
    expect(required?.text).toContain('Indique el dato correcto.');
    const extended = scenario
      .mailsTo(inquiryEmail)
      .find((mail) => mail.subject.startsWith('Ampliamos'));
    expect(extended?.subject).toContain('Ampliamos el plazo');
    expect(extended?.text).toContain('Consultamos varios módulos.');
  });
});

describe('correos al titular', () => {
  it('sin correo, el aviso queda atendido sin enviar nada', async () => {
    const dpo = await scenario.officer();
    const id = await scenario.fileInternal(dpo, {
      requester_email: null,
      requester_phone: '3000000000',
    });
    await scenario.step(dpo, id, 'extend', { reason: 'Consultamos varios módulos.' });
    const sentBefore = scenario.outbox.length;
    await scenario.work();
    expect(scenario.outbox.length).toBe(sentBefore);
    const detail = await scenario.privacyRequest(dpo, id);
    expect(detail.events.every((event) => event.mailed_at === null)).toBe(true);
    const pending = await scenario.inTenant((tx) =>
      tx.privacyRequestEvent.count({ where: { requestId: id, mailPending: true } }),
    );
    expect(pending).toBe(0);
  });
});

describe('entrega en PDF', () => {
  it('si el PDF no se puede preparar, lo reintenta y a los cinco intentos queda fallida', async () => {
    const dpo = await scenario.officer();
    const { requestId, exportId } = await requestedExport(dpo);
    const failing = {
      ...scenario.workDeps(),
      convertHtml: () => Promise.reject(new Error('Gotenberg no responde')),
    };
    // Cada intento fallido se informa a la cola, que lo vuelve a programar.
    for (let pass = 1; pass <= 4; pass += 1) {
      await expect(runPrivacyWork(failing, [scenario.tenant.id])).rejects.toThrow(
        'Gotenberg no responde',
      );
    }
    const waiting = await scenario.privacyRequest(dpo, requestId);
    expect(waiting.exports[0]?.status).toBe('pending');
    // El quinto ya no se reintenta: la entrega queda fallida y el Oficial pide otra.
    await runPrivacyWork(failing, [scenario.tenant.id]);
    const failed = await scenario.privacyRequest(dpo, requestId);
    expect(failed.exports[0]?.status).toBe('failed');
    const attempts = await scenario.inTenant((tx) =>
      tx.auditEvent.count({
        where: { entityId: exportId, action: 'privacy.data.export_render', result: 'failure' },
      }),
    );
    expect(attempts).toBe(5);
  });
});
