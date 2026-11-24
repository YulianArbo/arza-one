import { describe, expect, it } from 'vitest';

import { addBusinessDays } from '../../../src/modules/core/domain/business-days.js';
import {
  addDays,
  bogotaToday,
  isoWeekday,
} from '../../../src/modules/core/domain/calendar-date.js';
import { tenantScope } from '../iam/support/iam-fixtures.js';
import { CareScenario } from './support/care-scenario.js';

// PQRSF del B29 (ficha 17.9): radicación pública con radicado y fecha límite en días hábiles,
// consulta de estado con radicado y correo, clasificación con traslado a Privacidad, respuesta
// aprobada por otra persona y no conformidad para Calidad. Datos ficticios.

const scenario = new CareScenario('pqrsf');

const WEEKDAYS = new Set([1, 2, 3, 4, 5]);

/** El primer día hábil después de hoy, en hora de Colombia. */
function nextWeekday(from: string): string {
  let day = addDays(from, 1);
  while (!WEEKDAYS.has(isoWeekday(day))) day = addDays(day, 1);
  return day;
}

describe('radicación pública', () => {
  it('entrega el radicado y la fecha límite en días hábiles, sin contar festivos', async () => {
    const today = bogotaToday(scenario.clock.now());
    const holiday = nextWeekday(today);
    const holidays = await scenario.inTenant(async (tx) => {
      const key = { tenantId: scenario.tenant.id, holidayDate: new Date(`${holiday}T00:00:00Z`) };
      await tx.holiday.upsert({
        where: { tenantId_holidayDate: key },
        create: { ...key, name: 'Festivo de prueba' },
        update: { deletedAt: null },
      });
      const rows = await tx.holiday.findMany({ where: { deletedAt: null } });
      return new Set(rows.map((row) => row.holidayDate.toISOString().slice(0, 10)));
    });
    const filed = await scenario.filePublic({ type: 'petition' });
    const calendar = { workdays: WEEKDAYS, holidays };
    expect(filed.code).toMatch(/^PQRSF-\d{4}-\d{4}$/u);
    expect(filed.due_on).toBe(addBusinessDays(today, 15, calendar));
    const withoutHoliday = new Set([...holidays].filter((day) => day !== holiday));
    expect(filed.due_on).not.toBe(
      addBusinessDays(today, 15, { workdays: WEEKDAYS, holidays: withoutHoliday }),
    );
  });
});

describe('radicación pública', () => {
  it('pide aceptar el tratamiento de datos y rechaza el campo trampa', async () => {
    const noConsent = await scenario.public(
      'pqrsf',
      scenario.pqrsfForm({ accepts_privacy: false }),
    );
    expect(noConsent.status).toBe(422);
    const bot = await scenario.public('pqrsf', scenario.pqrsfForm({ website: 'spam.test' }));
    expect(bot.status).toBe(422);
  });
});

describe('radicación pública', () => {
  it('la consulta de estado exige el radicado y el mismo correo, y queda registrada', async () => {
    const filed = await scenario.filePublic();
    const ok = await scenario.public('pqrsf/status', { code: filed.code, email: filed.email });
    expect(ok.status, ok.text).toBe(200);
    expect(ok.body).toMatchObject({ code: filed.code, status: 'filed', response: null });
    const wrong = await scenario.public('pqrsf/status', {
      code: filed.code,
      email: 'otra.persona@ejemplo.test',
    });
    expect(wrong.status).toBe(404);
    const agent = await scenario.agent();
    const id = await scenario.pqrsfId(agent, filed.code);
    expect(await scenario.auditActions(id)).toEqual([
      'service.pqrsf.file',
      'service.pqrsf.consult',
    ]);
  });
});

describe('registro interno y clasificación', () => {
  it('Servicio registra la que llegó por teléfono, sin correo: sin acuse pendiente', async () => {
    const agent = await scenario.agent();
    const id = await scenario.create('/v1/pqrsf', agent, {
      channel: 'phone',
      type: 'suggestion',
      requester_name: 'Luis Rojas',
      requester_phone: '3001234567',
      subject: 'Horario de atención',
      description: 'Sugiere atender también los sábados en la mañana.',
    });
    const pqrsf = await scenario.pqrsfOf(agent, id);
    expect(pqrsf).toMatchObject({ channel: 'phone', term_days: 30, created_by: { id: agent.id } });
    const row = await scenario.inTenant((tx) => tx.svcPqrsf.findUniqueOrThrow({ where: { id } }));
    expect(row.mailPending).toBeNull();
    const none = await scenario.post('/v1/pqrsf', agent.session, {
      channel: 'phone',
      type: 'petition',
      requester_name: 'Sin contacto',
      subject: 'Sin contacto',
      description: 'No dejó correo ni teléfono para responderle.',
    });
    expect(none.status).toBe(422);
  });
});

describe('registro interno y clasificación', () => {
  it('la de datos personales toma el plazo de la Ley 1581 y avisa al Oficial de datos', async () => {
    const agent = await scenario.agent();
    const officer = await scenario.person('oficial-datos', ['OFICIAL_DATOS']);
    const filed = await scenario.filePublic({ type: 'petition' });
    const id = await scenario.pqrsfId(agent, filed.code);
    await scenario.pqrsfStepOk(agent, id, 'classify', {
      type: 'petition',
      privacy_kind: 'inquiry',
      assignee_id: agent.id,
    });
    const pqrsf = await scenario.pqrsfOf(officer, id);
    expect(pqrsf).toMatchObject({ status: 'classified', privacy_kind: 'inquiry', term_days: 10 });
    expect(pqrsf.transferred_at).not.toBeNull();
    // En la misma transacción nace la solicitud del titular en Privacidad (B42).
    const request = await scenario.inTenant((tx) =>
      tx.privacyRequest.findFirst({ where: { sourceCode: filed.code } }),
    );
    expect(request).toMatchObject({ channel: 'pqrsf', kind: 'inquiry', right: 'know' });
    await scenario.dispatchNotices();
    const notices = await scenario.noticesFor(officer.id, 'svc_pqrsf_update');
    expect(notices.join(' ')).toContain('Privacidad');
    expect(await scenario.auditActions(id)).toEqual(
      expect.arrayContaining(['service.pqrsf.classify', 'service.pqrsf.transfer']),
    );
  });
});

describe('registro interno y clasificación', () => {
  it('no asigna a quien no atiende ni a un tercero que no existe', async () => {
    const agent = await scenario.agent();
    const sales = await scenario.sales();
    const filed = await scenario.filePublic();
    const id = await scenario.pqrsfId(agent, filed.code);
    const wrongPerson = await scenario.pqrsfStep(agent, id, 'classify', {
      type: 'complaint',
      assignee_id: sales.id,
    });
    expect(wrongPerson.status).toBe(422);
    const wrongParty = await scenario.pqrsfStep(agent, id, 'classify', {
      type: 'complaint',
      assignee_id: agent.id,
      party_id: crypto.randomUUID(),
    });
    expect(wrongParty.status).toBe(422);
    expect((await scenario.pqrsfStep(agent, id, 'draft', { response: 'Muy pronto.' })).status).toBe(
      409,
    );
  });
});

describe('respuesta aprobada por otra persona (decisión 7)', () => {
  it('quien redactó no aprueba; otra persona la devuelve con motivo y luego la aprueba', async () => {
    const drafter = await scenario.agent();
    const approver = await scenario.agent();
    const id = await scenario.submitted(drafter);
    expect((await scenario.pqrsfOf(drafter, id)).can.approve).toBe(false);
    expect((await scenario.pqrsfStep(drafter, id, 'approve')).status).toBe(422);
    const back = await scenario.pqrsfStep(approver, id, 'return', { reason: 'Falta la fecha.' });
    expect(back.status, back.text).toBe(204);
    expect(await scenario.pqrsfOf(drafter, id)).toMatchObject({
      approval: 'returned',
      return_reason: 'Falta la fecha.',
    });
    await scenario.pqrsfStepOk(drafter, id, 'respond');
    await scenario.pqrsfStepOk(approver, id, 'approve');
    const done = await scenario.pqrsfOf(drafter, id);
    expect(done).toMatchObject({ status: 'responded', approved_by: { id: approver.id } });
    expect(done.response).toContain('Lamentamos la demora');
    await scenario.pqrsfStepOk(approver, id, 'close');
    expect((await scenario.pqrsfOf(drafter, id)).status).toBe('closed');
  });
});

describe('respuesta aprobada por otra persona (decisión 7)', () => {
  it('una queja procedente crea la no conformidad enlazada en Calidad (B38, decisión 4)', async () => {
    const drafter = await scenario.agent();
    const approver = await scenario.agent();
    const quality = await scenario.person('calidad', ['CALIDAD']);
    const id = await scenario.submitted(drafter, true);
    await scenario.pqrsfStepOk(approver, id, 'approve');
    const pqrsf = await scenario.pqrsfOf(quality, id);
    expect(pqrsf.nonconformity_at).not.toBeNull();
    const nc = await scenario.inTenant((tx) =>
      tx.qmsNonconformity.findFirstOrThrow({ where: { source: 'pqrsf', originId: id } }),
    );
    expect(nc).toMatchObject({
      status: 'detected',
      originCode: pqrsf.code,
      reportedBy: approver.id,
    });
    expect(nc.description).not.toContain(pqrsf.requester_name);
    await scenario.dispatchNotices();
    expect(
      (await scenario.noticesFor(quality.id, 'qms_nonconformity_reported')).join(' '),
    ).toContain(nc.code);
    expect(await scenario.auditActions(id)).toContain('service.pqrsf.request_nonconformity');
  });
});

describe('respuesta aprobada por otra persona (decisión 7)', () => {
  it('una queja exige decir si es procedente', async () => {
    const agent = await scenario.agent();
    const id = await scenario.classified(agent);
    const draft = await scenario.pqrsfStep(agent, id, 'draft', {
      response: 'Revisamos su caso con el equipo.',
    });
    expect(draft.status).toBe(422);
  });
});

describe('bandeja', () => {
  it('muestra por clasificar y por aprobar, y busca por radicado', async () => {
    const agent = await scenario.agent();
    const filed = await scenario.filePublic();
    const pending = await scenario.submitted(agent);
    const unclassified = await scenario.pqrsfInbox(agent, '?view=unclassified');
    expect(unclassified.map((row) => row.code)).toContain(filed.code);
    const approvals = await scenario.pqrsfInbox(agent, '?view=pending_approval');
    expect(approvals.map((row) => row.id)).toContain(pending);
    const found = await scenario.pqrsfInbox(agent, `?view=open&q=${filed.code}`);
    expect(found.map((row) => row.code)).toEqual([filed.code]);
    expect(found[0]?.due_state).toBe('on_time');
  });
});

describe('bandeja', () => {
  it('lo radicado en el sitio llega solo a la empresa del sitio', async () => {
    const stranger = await scenario.agent(scenario.otherTenant.id);
    const filed = await scenario.filePublic();
    const list = await scenario.pqrsfInbox(stranger, `?q=${filed.code}`);
    expect(list).toHaveLength(0);
    const rows = await tenantScope(
      scenario.db,
      scenario.otherTenant.id,
    )((tx) => tx.svcPqrsf.count({ where: { code: filed.code } }));
    expect(rows).toBe(0);
  });
});
