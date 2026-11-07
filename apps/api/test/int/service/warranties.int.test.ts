import { ticketDetailSchema, warrantyListResponseSchema, type Warranty } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { addDays } from '../../../src/modules/core/index.js';
import type { Person } from '../iam/support/access-scenario.js';
import { DeliveryScenario, type DeliveryProject } from '../project/support/delivery-scenario.js';

// Garantías por entregable (B28, decisión 10; numeral 13.3): cuando el cliente firma el acta y el
// entregable queda aceptado, en la misma transacción nace su garantía de 90 días. Un tiquete sobre
// ese entregable queda «en garantía». Servicio ajusta el fin; el Líder técnico no. Datos ficticios.

const scenario = new DeliveryScenario('mesa de ayuda: garantías');

interface Accepted {
  readonly delivery: DeliveryProject;
  readonly agent: Person;
  readonly deliverableId: string;
  readonly warranty: Warranty;
}

/** Un entregable que el cliente aceptó al firmar el acta, y su garantía. */
async function accepted(): Promise<Accepted> {
  const delivery = await scenario.deliveryProject();
  const agent = await scenario.person('servicio', ['SERVICIO']);
  const deliverableId = await scenario.create(
    `/v1/projects/${delivery.projectId}/deliverables`,
    delivery.leader,
    scenario.deliverableBody(),
  );
  await scenario.deliveredToClient(delivery, deliverableId);
  await scenario.clientSigns(delivery.client.signers[0]?.email ?? '');
  expect((await scenario.acceptanceWork()).answered).toBe(1);
  const list = warrantyListResponseSchema.parse(
    (await scenario.get('/v1/warranties?active=true', agent.session)).body,
  );
  const warranty = list.data.find((row) => row.deliverable.id === deliverableId);
  if (warranty === undefined) throw new Error('No nació la garantía del entregable aceptado');
  return { delivery, agent, deliverableId, warranty };
}

async function ticketOn(found: Accepted) {
  const id = await scenario.create('/v1/tickets', found.agent, {
    subject: 'Falla en la consulta de facturas',
    description: 'El portal no muestra las facturas de octubre.',
    category: 'incident',
    priority: 'high',
    project_id: found.delivery.projectId,
    deliverable_id: found.deliverableId,
  });
  const response = await scenario.get(`/v1/tickets/${id}`, found.agent.session);
  return ticketDetailSchema.parse(response.body);
}

describe('garantía del entregable aceptado', () => {
  it('nace al aceptar el entregable, marca sus tiquetes y Servicio la ajusta', async () => {
    const found = await accepted();
    const { warranty, delivery } = found;
    expect(warranty).toMatchObject({ active: true, project: { id: delivery.projectId } });
    expect(warranty.ends_on).toBe(addDays(warranty.starts_on, 90));
    expect(await scenario.auditActions(warranty.id)).toEqual(['service.warranty.start']);
    expect(await ticketOn(found)).toMatchObject({
      in_warranty: true,
      warranty: { id: warranty.id },
      deliverable: { id: found.deliverableId },
      party: { id: delivery.client.partyId },
    });

    const extend = { ends_on: addDays(warranty.ends_on, 30), scope: 'Fallas y ajustes.' };
    const path = `/v1/warranties/${warranty.id}`;
    expect((await scenario.put(path, delivery.leader, extend, warranty.version)).status).toBe(403);
    const saved = await scenario.put(path, found.agent, extend, warranty.version);
    expect(saved.status, saved.text).toBe(204);
  });
});
