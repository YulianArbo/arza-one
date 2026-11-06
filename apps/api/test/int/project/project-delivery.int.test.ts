import { downloadLinkResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import type { Person } from '../iam/support/access-scenario.js';
import { tenantScope } from '../iam/support/iam-fixtures.js';
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
