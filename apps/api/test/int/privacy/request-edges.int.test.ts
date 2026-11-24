import { privacyRequestListResponseSchema, publicPrivacyStatusSchema } from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import { bogotaToday } from '../../../src/modules/core/index.js';
import type { Person } from '../iam/support/access-scenario.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import { RequestScenario, REQUESTS } from './support/request-scenario.js';

// Bordes de las solicitudes de titulares (B42, decisión 4): lo que el Oficial no puede hacer fuera
// de tiempo o fuera de orden, los filtros de la bandeja, la consulta pública de un reclamo
// suspendido y respondido, y el registro en CSV. Datos ficticios.

const scenario = new RequestScenario('privacidad bordes de solicitudes');

function daysAgo(days: number): string {
  const at = scenario.clock.now();
  return bogotaToday(new Date(at.getTime() - days * 86_400_000));
}

async function attempt(dpo: Person, id: string, action: string, body: object): Promise<string> {
  const current = await scenario.privacyRequest(dpo, id);
  const path = `${REQUESTS}/${id}/actions/${action}`;
  return errorCode(await scenario.act(path, dpo.session, current.version, body));
}

describe('reclamo incompleto', () => {
  it('se pide una sola vez y, mientras espera, ni se responde ni se amplía', async () => {
    const dpo = await scenario.officer();
    const id = await scenario.verified(dpo, await scenario.holder(), { right: 'rectify' });
    await scenario.step(dpo, id, 'require', { text: 'Indique el dato correcto.' });
    const twice = await attempt(dpo, id, 'require', { text: 'Otra vez.' });
    expect(twice).toBe('PRIVACY_REQUEST_STEP_INVALID');
    const answer = await attempt(dpo, id, 'respond', {
      response: 'Corregimos el dato que nos indicó en su reclamo.',
    });
    expect(answer).toBe('PRIVACY_REQUEST_STEP_INVALID');
    const extend = await attempt(dpo, id, 'extend', { reason: 'Necesitamos más tiempo.' });
    expect(extend).toBe('PRIVACY_REQUEST_STEP_INVALID');
  });
});

describe('reclamo incompleto', () => {
  it('pasados los 5 días hábiles ya no se pide; lo completado no puede ser de antes', async () => {
    const dpo = await scenario.officer();
    const late = await scenario.fileInternal(dpo, { right: 'rectify', received_on: daysAgo(20) });
    const tooLate = await attempt(dpo, late, 'require', { text: 'Indique el dato correcto.' });
    expect(tooLate).toBe('PRIVACY_REQUEST_STEP_INVALID');
    const open = await scenario.fileInternal(dpo, { right: 'rectify', received_on: daysAgo(1) });
    const notWaiting = await attempt(dpo, open, 'answer-requirement', {
      note: 'Llegó el dato.',
      answered_on: scenario.today(),
    });
    expect(notWaiting).toBe('PRIVACY_REQUEST_STEP_INVALID');
    await scenario.step(dpo, open, 'require', { text: 'Indique el dato correcto.' });
    const before = await attempt(dpo, open, 'answer-requirement', {
      note: 'Llegó el dato.',
      answered_on: daysAgo(10),
    });
    expect(before).toBe('PRIVACY_REQUEST_STEP_INVALID');
  });
});

describe('plazos', () => {
  it('vencido el plazo ya no se amplía; sin una persona vigente no se verifica', async () => {
    const dpo = await scenario.officer();
    const overdue = await scenario.fileInternal(dpo, { received_on: daysAgo(40) });
    const late = await attempt(dpo, overdue, 'extend', { reason: 'Necesitamos más tiempo.' });
    expect(late).toBe('PRIVACY_REQUEST_STEP_INVALID');
    const unknown = await attempt(dpo, overdue, 'verify', {
      party_id: uuidv7(),
      method: 'document',
      note: 'Revisé la cédula.',
    });
    expect(unknown).toBe('PRIVACY_REQUEST_STEP_INVALID');
  });
});

describe('bandeja', () => {
  it('filtra por estado, tipo y titular, y pasa de página', async () => {
    const dpo = await scenario.officer();
    const partyId = await scenario.holder();
    const verified = await scenario.verified(dpo, partyId, { right: 'rectify' });
    await scenario.fileInternal(dpo);
    await scenario.fileInternal(dpo);
    const query = `status=in_progress&kind=claim&party_id=${partyId}`;
    const filtered = await scenario.get(`${REQUESTS}?${query}`, dpo.session);
    const ids = privacyRequestListResponseSchema.parse(filtered.body).data.map((row) => row.id);
    expect(ids).toEqual([verified]);
    const first = privacyRequestListResponseSchema.parse(
      (await scenario.get(`${REQUESTS}?limit=1`, dpo.session)).body,
    );
    expect(first.next_cursor).not.toBeNull();
    const next = await scenario.get(
      `${REQUESTS}?limit=1&cursor=${String(first.next_cursor)}`,
      dpo.session,
    );
    const second = privacyRequestListResponseSchema.parse(next.body).data;
    expect(second[0]?.id).not.toBe(first.data[0]?.id);
  });
});

describe('consulta pública', () => {
  it('muestra lo que falta mientras espera y la respuesta cuando se responde', async () => {
    const dpo = await scenario.officer();
    const filed = await scenario.filePublic({ right: 'rectify' });
    const [row] = privacyRequestListResponseSchema
      .parse((await scenario.get(`${REQUESTS}?limit=200`, dpo.session)).body)
      .data.filter((item) => item.code === filed.code);
    const id = row?.id ?? '';
    await scenario.step(dpo, id, 'verify', {
      party_id: await scenario.holder(),
      method: 'document',
      note: 'Revisé la cédula.',
    });
    await scenario.step(dpo, id, 'require', { text: 'Indique el dato correcto.' });
    const status = async () =>
      publicPrivacyStatusSchema.parse(
        (await scenario.public('/status', { code: filed.code, email: filed.email })).body,
      );
    expect((await status()).requirement).toBe('Indique el dato correcto.');
    const body = { note: 'Envió el dato.', answered_on: scenario.today() };
    await scenario.step(dpo, id, 'answer-requirement', body);
    await scenario.step(dpo, id, 'respond', {
      response: 'Corregimos el dato que nos indicó en su reclamo.',
    });
    const answered = await status();
    expect([answered.requirement, answered.response]).toEqual([
      null,
      'Corregimos el dato que nos indicó en su reclamo.',
    ]);
  });
});

describe('registro en CSV', () => {
  it('marca el plazo suspendido y la prórroga', async () => {
    const dpo = await scenario.officer();
    const claim = await scenario.fileInternal(dpo, { right: 'rectify' });
    await scenario.step(dpo, claim, 'require', { text: 'Indique el dato correcto.' });
    const inquiry = await scenario.fileInternal(dpo);
    await scenario.step(dpo, inquiry, 'extend', { reason: 'Consultamos varios módulos.' });
    const csv = await scenario.post(`${REQUESTS}/export`, dpo.session, {});
    expect(csv.status, csv.text).toBe(200);
    expect(csv.text).toContain('Suspendido');
    expect(csv.text).toContain('Sí');
  });
});
