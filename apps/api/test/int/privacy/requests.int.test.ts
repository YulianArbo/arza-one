import { publicPrivacyStatusSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { bogotaToday, businessDeadline } from '../../../src/modules/core/index.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import { REQUESTS, RequestScenario } from './support/request-scenario.js';

// Solicitudes de titulares (B42, ficha 17.19; Ley 1581, arts. 14 y 15): plazo legal en días hábiles
// con tarea para el Oficial, verificación de identidad, requerimiento que suspende el plazo, una
// sola prórroga, respuesta por correo y cierre que cierra la tarea.

const scenario = new RequestScenario('privacidad solicitudes');

async function expectedDue(from: string, days: number): Promise<string> {
  return scenario.inTenant((tx) => businessDeadline(tx, from, days));
}

/** La tarea vence al terminar el día límite en Colombia: ese es el día que se compara. */
function dueDay(dueAt: Date | null | undefined): string | null {
  return dueAt === null || dueAt === undefined ? null : bogotaToday(new Date(dueAt.getTime() - 1));
}

async function taskOf(id: string) {
  return scenario.inTenant(async (tx) => {
    const instance = await tx.workflowInstance.findFirstOrThrow({ where: { entityId: id } });
    const task = await tx.workflowTask.findFirst({ where: { instanceId: instance.id } });
    return { instance, task };
  });
}

describe('sitio público', () => {
  it('la consulta recibe código, fecha límite de 10 días hábiles, tarea y constancia', async () => {
    const receipt = await scenario.filePublic();
    expect(receipt.code).toMatch(/^PRV-\d{4}-\d{4,}$/);
    expect(receipt.kind).toBe('inquiry');
    expect(receipt.due_on).toBe(await expectedDue(scenario.today(), 10));
    const row = await scenario.inTenant((tx) =>
      tx.privacyRequest.findFirstOrThrow({ where: { code: receipt.code } }),
    );
    const { task } = await taskOf(row.id);
    expect(task?.assigneeRole).toBe('OFICIAL_DATOS');
    expect(dueDay(task?.dueAt)).toBe(receipt.due_on);
    await scenario.work();
    const [mail] = scenario.mailsTo(receipt.email);
    expect(mail?.subject).toContain(receipt.code);
  });

  it('el reclamo tiene 15 días hábiles', async () => {
    const receipt = await scenario.filePublic({ right: 'rectify' });
    expect(receipt.kind).toBe('claim');
    expect(receipt.due_on).toBe(await expectedDue(scenario.today(), 15));
  });

  it('el estado se consulta con el código y el correo; si no coinciden, no existe', async () => {
    const receipt = await scenario.filePublic();
    const found = await scenario.public('/status', { code: receipt.code, email: receipt.email });
    expect(found.status, found.text).toBe(200);
    expect(publicPrivacyStatusSchema.parse(found.body).status).toBe('received');
    const wrong = { code: receipt.code, email: 'otra.persona@ejemplo.test' };
    expect(errorCode(await scenario.public('/status', wrong))).toBe('PRIVACY_REQUEST_NOT_FOUND');
  });

  it('sin la casilla de autorización no se recibe', async () => {
    const response = await scenario.public('', scenario.publicBody({ accepts_privacy: false }));
    expect(response.status).toBe(422);
  });
});

describe('recorrido del Oficial', () => {
  it('verifica, responde por correo y al cerrar se cierra su tarea', async () => {
    const dpo = await scenario.officer();
    const partyId = await scenario.holder();
    const id = await scenario.fileInternal(dpo);
    const started = await scenario.step(dpo, id, 'start-verification');
    expect(started.status).toBe('verifying');
    const note = 'Revisé la copia de la cédula.';
    const verified = await scenario.step(dpo, id, 'verify', {
      party_id: partyId,
      method: 'document',
      note,
    });
    expect(verified.status).toBe('in_progress');
    expect(verified.verification?.method).toBe('document');
    const response = 'Estos son los datos que tenemos de usted en la plataforma.';
    const answered = await scenario.step(dpo, id, 'respond', { response });
    expect(answered.status).toBe('responded');
    const closed = await scenario.step(dpo, id, 'close');
    expect(closed.closure).toBe('answered');
    expect((await taskOf(id)).instance.completedAt).not.toBeNull();
    await scenario.work();
    const mails = scenario.mailsTo(answered.requester_email ?? '');
    expect(mails.map((mail) => mail.text).join('\n')).toContain(response);
  });

  it('no se responde sin verificar la identidad', async () => {
    const dpo = await scenario.officer();
    const id = await scenario.fileInternal(dpo);
    const body = { response: 'Respuesta sin verificar la identidad del titular.' };
    const result = await scenario.act(`${REQUESTS}/${id}/actions/respond`, dpo.session, 1, body);
    expect(errorCode(result)).toBe('PRIVACY_REQUEST_STEP_INVALID');
  });

  it('una fecha de recepción futura se rechaza', async () => {
    const dpo = await scenario.officer();
    const body = scenario.internalBody({ received_on: '2099-01-01' });
    expect((await scenario.post(REQUESTS, dpo.session, body)).status).toBe(422);
  });
});

describe('plazos', () => {
  it('la prórroga suma 5 días hábiles a la consulta, una sola vez, y mueve la tarea', async () => {
    const dpo = await scenario.officer();
    const id = await scenario.fileInternal(dpo);
    const before = await scenario.privacyRequest(dpo, id);
    const reason = 'Debemos consultar varios módulos.';
    const extended = await scenario.step(dpo, id, 'extend', { reason });
    expect(extended.due_on).toBe(await expectedDue(before.due_on ?? '', 5));
    expect(extended.extended).toBe(true);
    const { task } = await taskOf(id);
    expect(dueDay(task?.dueAt)).toBe(extended.due_on);
    const again = await scenario.act(
      `${REQUESTS}/${id}/actions/extend`,
      dpo.session,
      extended.version,
      { reason },
    );
    expect(errorCode(again)).toBe('PRIVACY_REQUEST_STEP_INVALID');
  });

  it('pedir que complete el reclamo suspende el plazo; al completarlo vuelve a correr', async () => {
    const dpo = await scenario.officer();
    const id = await scenario.fileInternal(dpo, { right: 'rectify' });
    const paused = await scenario.step(dpo, id, 'require', { text: 'Indique qué dato corregir.' });
    expect(paused.due_on).toBeNull();
    expect(paused.paused).toBe(true);
    expect((await taskOf(id)).task?.dueAt).toBeNull();
    const body = { note: 'Envió el dato correcto.', answered_on: scenario.today() };
    const resumed = await scenario.step(dpo, id, 'answer-requirement', body);
    expect(resumed.due_on).toBe(await expectedDue(scenario.today(), 15));
    expect(resumed.paused).toBe(false);
  });

  it('a una consulta no se le pide completar información', async () => {
    const dpo = await scenario.officer();
    const id = await scenario.fileInternal(dpo);
    const body = { text: 'Indique qué dato corregir.' };
    const result = await scenario.act(`${REQUESTS}/${id}/actions/require`, dpo.session, 1, body);
    expect(errorCode(result)).toBe('PRIVACY_REQUEST_STEP_INVALID');
  });
});
