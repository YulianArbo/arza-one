import { downloadLinkResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import type { Person } from '../iam/support/access-scenario.js';
import { errorCode, tenantScope } from '../iam/support/iam-fixtures.js';
import { DeliveryScenario, type DeliveryProject } from './support/delivery-scenario.js';

// Criterio del B27: «Aceptar un entregable genera el acta firmada y el evento para facturar». El
// líder entrega; la plataforma llena el acta FT-TEC-001, genera su PDF y la envía a firma de la
// persona del cliente (enlace y código). Al firmar, el entregable queda aceptado con el acta
// firmada, el hito queda listo para facturar con su valor y Finanzas recibe el aviso.

const scenario = new DeliveryScenario('entregables');

async function newDeliverable(delivery: DeliveryProject, overrides: object = {}): Promise<string> {
  return scenario.create(
    `/v1/projects/${delivery.projectId}/deliverables`,
    delivery.leader,
    scenario.deliverableBody(overrides),
  );
}

/** El hito quedó listo para facturar por el 25 % del contrato, con su evento. */
async function expectBillable(leader: Person, projectId: string, milestoneId: string) {
  const project = await scenario.project(leader, projectId);
  expect(project.milestones.find((m) => m.id === milestoneId)?.status).toBe('billable');
  const milestone = await tenantScope(
    scenario.db,
    scenario.tenant.id,
  )((tx) => tx.prjMilestone.findFirstOrThrow({ where: { id: milestoneId } }));
  expect(milestone.billableAmount?.toFixed(2)).toBe('3000000.00');
  expect(await scenario.outboxEvents(milestoneId)).toContain('project.milestone.billable');
}

async function expectSignedActa(leader: Person, projectId: string, id: string) {
  const accepted = await scenario.deliverableOf(leader, projectId, id);
  expect(accepted.status).toBe('accepted');
  expect(accepted.acceptance).toMatchObject({ status: 'accepted', signed_pdf: true });
  const link = await scenario.post(
    `/v1/projects/${projectId}/deliverables/${id}/acta-link`,
    leader.session,
    {},
  );
  expect(link.status, link.text).toBe(201);
  expect(downloadLinkResponseSchema.parse(link.body).url).toContain('/v1/files/');
}

it('valida el hito, la versión y el firmante del entregable', async () => {
  const delivery = await scenario.deliveryProject();
  const { leader, projectId } = delivery;
  const path = `/v1/projects/${projectId}/deliverables`;
  const missing = '00000000-0000-4000-8000-000000000001';
  expect(
    (await scenario.post(path, leader.session, scenario.deliverableBody({ milestone_id: missing })))
      .status,
  ).toBe(404);
  const id = await newDeliverable(delivery);
  const { version } = await scenario.deliverableOf(leader, projectId, id);
  const updated = await scenario.put(
    `${path}/${id}`,
    leader,
    scenario.deliverableBody({
      milestone_id: delivery.milestoneId,
      description: null,
      version_label: null,
    }),
    version,
  );
  expect(updated.status, updated.text).toBe(204);
  const stale = await scenario.put(`${path}/${id}`, leader, scenario.deliverableBody(), version);
  expect(stale.status).toBe(409);
  const unauthorizedSigner = await scenario.deliver(leader, { projectId, id, signerId: missing });
  expect(unauthorizedSigner.status).toBe(422);
});

it('impide editar o volver a entregar mientras el acta está abierta', async () => {
  const delivery = await scenario.deliveryProject();
  const { leader, projectId, client } = delivery;
  const path = `/v1/projects/${projectId}/deliverables`;
  const id = await newDeliverable(delivery, { description: null, version_label: null });
  const target = { projectId, id, signerId: client.signers[0]?.personId ?? '' };
  const sent = await scenario.deliver(leader, target, {
    pending_note: 'Queda pendiente el manual.',
  });
  expect(sent.status, sent.text).toBe(201);
  expect(errorCode(await scenario.deliver(leader, target))).toBe('PROJECT_STATUS_INVALID');
  const delivered = await scenario.deliverableOf(leader, projectId, id);
  const edit = await scenario.put(
    `${path}/${id}`,
    leader,
    scenario.deliverableBody(),
    delivered.version,
  );
  expect(errorCode(edit)).toBe('PROJECT_STATUS_INVALID');
});

describe('entrega y aceptación con acta firmada (FT-TEC-001)', () => {
  it('firmar el acta acepta el entregable y deja el hito listo para facturar', async () => {
    const delivery = await scenario.deliveryProject();
    const finance = await scenario.person('finanzas', ['ADMIN_FINANCIERO']);
    const { leader, projectId, milestoneId, client } = delivery;
    const id = await newDeliverable(delivery, { milestone_id: milestoneId });
    await scenario.deliveredToClient(delivery, id);
    const sent = await scenario.deliverableOf(leader, projectId, id);
    expect(sent.status).toBe('delivered');
    expect(sent.acceptance?.status).toBe('in_signature');
    expect(sent.acceptance?.record_code).toMatch(/^FT-TEC-001-\d{4}-\d{4}$/u);
    expect(sent.acceptance?.envelope_code).toMatch(/^FE-\d{4}-\d{4}$/u);

    await scenario.clientSigns(client.signers[0]?.email ?? '');
    expect((await scenario.acceptanceWork()).answered).toBe(1);
    await expectSignedActa(leader, projectId, id);
    await expectBillable(leader, projectId, milestoneId);
    const duplicate = await scenario.post(
      `/v1/projects/${projectId}/deliverables`,
      leader.session,
      scenario.deliverableBody({ milestone_id: milestoneId }),
    );
    expect(errorCode(duplicate)).toBe('PROJECT_STATUS_INVALID');
    const resend = await scenario.deliver(leader, {
      projectId,
      id,
      signerId: client.signers[0]?.personId ?? '',
    });
    expect(errorCode(resend)).toBe('PROJECT_STATUS_INVALID');
    await scenario.dispatchNotices();
    expect((await scenario.noticesFor(finance.id)).join(' ')).toContain('$ 3.000.000,00');
  });
});

describe('devolución del acta', () => {
  it('si el cliente devuelve el acta, el entregable queda devuelto con su motivo', async () => {
    const delivery = await scenario.deliveryProject();
    const { leader, projectId, client } = delivery;
    const id = await newDeliverable(delivery);
    await scenario.deliveredToClient(delivery, id);
    const { token, ticket } = await scenario.ticketFor(client.signers[0]?.email ?? '');
    const reason = 'Falta el manual de usuario.';
    const rejected = await scenario.publicSign('reject', { token, ticket, reason });
    expect(rejected.status, rejected.text).toBe(204);
    await scenario.acceptanceWork();

    const returned = await scenario.deliverableOf(leader, projectId, id);
    expect(returned.status).toBe('returned');
    expect(returned.acceptance?.status).toBe('returned');
    expect(returned.acceptance?.client_note).toContain('manual de usuario');
    const link = await scenario.post(
      `/v1/projects/${projectId}/deliverables/${id}/acta-link`,
      leader.session,
      {},
    );
    expect(link.status, link.text).toBe(201);

    // Se corrige y se entrega de nuevo: otra acta.
    const fixed = await scenario.put(
      `/v1/projects/${projectId}/deliverables/${id}`,
      leader,
      scenario.deliverableBody({ version_label: '1.0.1' }),
      returned.version,
    );
    expect(fixed.status, fixed.text).toBe(204);
    await scenario.deliveredToClient(delivery, id);
    const again = await scenario.deliverableOf(leader, projectId, id);
    expect(again.acceptance?.status).toBe('in_signature');
  });
});

it('distingue un entregable sin acta de uno con PDF pendiente', async () => {
  const delivery = await scenario.deliveryProject();
  const { leader, projectId, client } = delivery;
  const id = await newDeliverable(delivery);
  const path = `/v1/projects/${projectId}/deliverables/${id}/acta-link`;
  expect((await scenario.post(path, leader.session, {})).status).toBe(404);
  const sent = await scenario.deliver(leader, {
    projectId,
    id,
    signerId: client.signers[0]?.personId ?? '',
  });
  expect(sent.status, sent.text).toBe(201);
  expect(errorCode(await scenario.post(path, leader.session, {}))).toBe('PROJECT_STATUS_INVALID');
  await scenario.acceptanceWork();
  expect((await scenario.deliverableOf(leader, projectId, id)).acceptance?.status).toBe(
    'preparing',
  );
});

/** Pasa el plazo: el worker de firma vence el proceso y el de actas lo lee. */
async function afterDays(days: number): Promise<void> {
  scenario.clock.advance(days * 86_400_000);
  await scenario.signatureFollowUp();
  await scenario.acceptanceWork();
}

describe('plazo vencido', () => {
  it('sin cláusula queda sin respuesta; con ella, aceptado tácitamente', async () => {
    const delivery = await scenario.deliveryProject();
    const { projectId } = delivery;
    const silent = await newDeliverable(delivery, { name: 'Manual de usuario' });
    await scenario.deliveredToClient(delivery, silent);
    await afterDays(11);
    const leader = await scenario.refresh(delivery.leader);
    const unanswered = await scenario.deliverableOf(leader, projectId, silent);
    expect(unanswered.status).toBe('delivered');
    expect(unanswered.acceptance?.status).toBe('unanswered');

    const project = await scenario.project(leader, projectId);
    const settings = await scenario.put(
      `/v1/projects/${projectId}/control-settings`,
      leader,
      { hour_cost: null, respond_days: 5, tacit_acceptance: true, tacit_clause: 'Cláusula 9.2' },
      project.version,
    );
    expect(settings.status, settings.text).toBe(204);
    await scenario.deliveredToClient({ ...delivery, leader }, silent);
    await afterDays(6);
    const tacit = await scenario.deliverableOf(await scenario.refresh(leader), projectId, silent);
    expect(tacit.status).toBe('accepted');
    expect(tacit.acceptance?.status).toBe('tacit');
  });
});
