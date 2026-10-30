import { describe, expect, it } from 'vitest';

import { errorCode, tenantScope } from '../iam/support/iam-fixtures.js';
import { ContractScenario, DAY } from './support/contract-scenario.js';

// Firma manuscrita, vencimientos, obligaciones, otrosíes, prórrogas y terminación (B24, ficha 17.7).
// El reloj de la prueba avanza para alcanzar las alertas de 90, 60 y 30 días.

const scenario = new ContractScenario('contratos seguimiento');

async function expiryTasks(contractId: string) {
  return tenantScope(
    scenario.db,
    scenario.tenant.id,
  )((tx) =>
    tx.workflowTask.findMany({
      where: { instance: { entityId: contractId, entityType: 'ctr.expiry' } },
      orderBy: { createdAt: 'asc' },
    }),
  );
}

/** Contrato vigente con un otrosí propuesto que cambia el fin y el valor. */
async function proposedAmendment() {
  const sales = await scenario.sales();
  const id = await scenario.activeContract(sales);
  const amendmentId = await scenario.create(`/v1/contracts/${id}/amendments`, sales, {
    summary: 'Se amplía el alcance con el módulo de pagos',
    body: 'Las partes acuerdan incluir en el objeto el módulo de pagos en línea.',
    effective_on: scenario.day(0),
    new_ends_on: scenario.day(400),
    new_value: '15000000.00',
  });
  return { sales, id, base: `/v1/contracts/${id}/amendments/${amendmentId}/actions` };
}

describe('firma manuscrita digitalizada', () => {
  it('con la copia firmada en PDF el contrato queda vigente; otra cosa no sirve', async () => {
    const sales = await scenario.sales();
    const id = await scenario.approvedContract(sales);
    const image = await scenario.signedCopy(sales, 'image/png');
    const wrong = [
      { file_id: image, signed_on: scenario.day(0) },
      { file_id: await scenario.signedCopy(sales), signed_on: scenario.day(2) },
      { file_id: crypto.randomUUID(), signed_on: scenario.day(0) },
    ];
    for (const body of wrong) {
      expect((await scenario.contractStep(sales, id, 'register-signature', body)).status).toBe(422);
    }
    const file = await scenario.signedCopy(sales);
    const ok = await scenario.contractStep(sales, id, 'register-signature', {
      file_id: file,
      signed_on: scenario.day(0),
    });
    expect(ok.status, ok.text).toBe(204);
    expect(await scenario.contractDetail(sales, id)).toMatchObject({
      status: 'active',
      signed: { file: { id: file }, signed_on: scenario.day(0), by: { id: sales.id } },
    });
  });
});

describe('un contrato próximo a vencer genera tarea al responsable', () => {
  it('avisa a 90, 60 y 30 días sin repetir, y al pasar su fin queda terminado', async () => {
    let sales = await scenario.sales();
    const id = await scenario.activeContract(sales, { ends_on: scenario.day(100) });
    expect((await scenario.followUp()).alerts).toBe(0);
    scenario.clock.advance(10 * DAY);
    // La sesión dura 8 horas: con el reloj adelantado, la persona vuelve a entrar.
    sales = await scenario.refresh(sales);
    await scenario.followUp();
    expect(await scenario.contractDetail(sales, id)).toMatchObject({
      status: 'expiring',
      last_alert_days: 90,
    });
    const [task] = await expiryTasks(id);
    expect(task).toMatchObject({ assigneeId: sales.id, completedAt: null });
    await scenario.followUp();
    expect(await expiryTasks(id)).toHaveLength(1);
    scenario.clock.advance(30 * DAY);
    // La sesión dura 8 horas: con el reloj adelantado, la persona vuelve a entrar.
    sales = await scenario.refresh(sales);
    await scenario.followUp();
    expect((await scenario.contractDetail(sales, id)).last_alert_days).toBe(60);
    // La tarea de los 90 días sigue abierta: no se duplica, solo llega el aviso.
    expect(await expiryTasks(id)).toHaveLength(1);
    scenario.clock.advance(70 * DAY);
    // La sesión dura 8 horas: con el reloj adelantado, la persona vuelve a entrar.
    sales = await scenario.refresh(sales);
    await scenario.followUp();
    expect(await scenario.contractDetail(sales, id)).toMatchObject({
      status: 'terminated',
      termination: { reason: expect.stringContaining('Terminó su plazo') as unknown },
    });
    expect(await scenario.auditActions(id)).toEqual(
      expect.arrayContaining(['contract.expiry.alert', 'contract.expire']),
    );
  });
});

describe('obligaciones', () => {
  it('avisa 7 días antes, la marca vencida al pasar su fecha y se cumple con una nota', async () => {
    let sales = await scenario.sales();
    const id = await scenario.activeContract(sales);
    const base = `/v1/contracts/${id}/obligations`;
    const soon = await scenario.create(base, sales, {
      description: 'Entregar el prototipo navegable',
      responsible_id: sales.id,
      due_on: scenario.day(5),
    });
    const past = await scenario.create(base, sales, {
      description: 'Recibir los accesos al servidor',
      responsible_id: sales.id,
      due_on: scenario.day(1),
    });
    scenario.clock.advance(2 * DAY);
    sales = await scenario.refresh(sales);
    expect(await scenario.followUp()).toMatchObject({ reminders: 1, overdue: 1 });
    expect((await scenario.followUp()).reminders).toBe(0);
    const contract = await scenario.contractDetail(sales, id);
    const statuses = new Map(contract.obligations.map((row) => [row.id, row.status]));
    expect(statuses.get(soon)).toBe('pending');
    expect(statuses.get(past)).toBe('overdue');
    const version = contract.obligations.find((row) => row.id === soon)?.version ?? 0;
    const done = await scenario.action(`${base}/${soon}/actions/complete`, sales, version, {
      note: 'Se entregó por correo.',
    });
    expect(done.status, done.text).toBe(204);
    const after = await scenario.contractDetail(sales, id);
    expect(after.obligations.find((row) => row.id === soon)).toMatchObject({
      status: 'done',
      done_note: 'Se entregó por correo.',
    });
  });
});

describe('otrosí', () => {
  it('lo aprueba la Dirección, tiene PDF y al registrar la firmada cambia el fin y el valor', async () => {
    const { sales, id, base } = await proposedAmendment();
    expect(errorCode(await scenario.action(`${base}/approve`, sales, 1, {}))).toBe(
      'PERMISSION_DENIED',
    );
    const director = await scenario.director();
    const pending = (await scenario.contractDetail(sales, id)).amendments[0];
    expect(pending?.status).toBe('in_review');
    const decision = await scenario.action(`${base}/approve`, director, pending?.version ?? 0, {});
    expect(decision.status, decision.text).toBe(204);
    await scenario.renderPdfs();
    const approved = (await scenario.contractDetail(sales, id)).amendments[0];
    expect(approved).toMatchObject({
      code: expect.stringMatching(/-OT01$/u) as unknown,
      status: 'approved',
      pdf_ready: true,
    });
    const signed = await scenario.action(
      `${base}/register-signature`,
      sales,
      approved?.version ?? 0,
      {
        file_id: await scenario.signedCopy(sales),
        signed_on: scenario.day(0),
      },
    );
    expect(signed.status, signed.text).toBe(204);
    expect(await scenario.contractDetail(sales, id)).toMatchObject({
      ends_on: scenario.day(400),
      value: '15000000.00',
      amendments: [{ status: 'signed' }],
    });
  });
});

describe('otrosí', () => {
  it('la prórroga la decide la Dirección; Comercial no prorroga ni termina', async () => {
    const sales = await scenario.sales();
    const id = await scenario.activeContract(sales);
    const renewal = { new_ends_on: scenario.day(730), summary: 'El cliente renueva un año más' };
    const path = `/v1/contracts/${id}/actions/renew`;
    expect(errorCode(await scenario.post(path, sales.session, renewal))).toBe('PERMISSION_DENIED');
    const director = await scenario.director();
    const created = await scenario.post(path, director.session, renewal);
    expect(created.status, created.text).toBe(201);
    const short = await scenario.post(path, director.session, {
      ...renewal,
      new_ends_on: scenario.day(10),
    });
    expect(errorCode(short)).toBe('CONTRACT_DATES_INVALID');
    expect((await scenario.contractDetail(sales, id)).amendments[0]).toMatchObject({
      kind: 'extension',
      status: 'approved',
    });
    const reason = { terminated_on: scenario.day(0), reason: 'El cliente cerró la operación.' };
    expect(errorCode(await scenario.contractStep(sales, id, 'terminate', reason))).toBe(
      'PERMISSION_DENIED',
    );
    expect((await scenario.contractStep(director, id, 'terminate', reason)).status).toBe(204);
    expect(await scenario.contractDetail(sales, id)).toMatchObject({
      status: 'terminated',
      termination: { reason: 'El cliente cerró la operación.', by: { id: director.id } },
    });
  });
});
