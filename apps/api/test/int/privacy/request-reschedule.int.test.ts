import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import { rescheduleWorkflow } from '../../../src/modules/wf/index.js';
import { RequestScenario } from './support/request-scenario.js';

// La fecha legal en la tarea del Oficial (B42, decisión 5): mover la fecha de un trámite que ya se
// cerró o que no existe no cambia nada, y una fecha ya pasada no saca de «vencida» a la tarea.
// Datos ficticios.

const scenario = new RequestScenario('privacidad fecha de la tarea');

function context() {
  return { tenantId: scenario.tenant.id, userId: null, meta: null, at: scenario.clock.now() };
}

async function instanceOf(requestId: string): Promise<string> {
  const row = await scenario.inTenant((tx) =>
    tx.privacyRequest.findUniqueOrThrow({ where: { id: requestId } }),
  );
  return row.workflowInstanceId ?? '';
}

describe('fecha de la tarea', () => {
  it('un trámite cerrado o inexistente no se mueve', async () => {
    const dpo = await scenario.officer();
    const id = await scenario.verified(dpo, await scenario.holder());
    await scenario.step(dpo, id, 'respond', {
      response: 'Estos son los datos que tenemos de usted.',
    });
    await scenario.step(dpo, id, 'close');
    const instanceId = await instanceOf(id);
    const later = new Date(scenario.clock.now().getTime() + 30 * 86_400_000);
    const moved = await scenario.inTenant((tx) =>
      rescheduleWorkflow(tx, context(), { instanceId, dueAt: later }),
    );
    const missing = await scenario.inTenant((tx) =>
      rescheduleWorkflow(tx, context(), { instanceId: uuidv7(), dueAt: later }),
    );
    expect([moved, missing]).toEqual([false, false]);
  });

  it('una fecha ya pasada deja la tarea vencida', async () => {
    const dpo = await scenario.officer();
    const instanceId = await instanceOf(await scenario.fileInternal(dpo));
    const past = new Date(scenario.clock.now().getTime() - 86_400_000);
    const task = await scenario.inTenant(async (tx) => {
      await tx.workflowTask.updateMany({ where: { instanceId }, data: { status: 'overdue' } });
      await rescheduleWorkflow(tx, context(), { instanceId, dueAt: past });
      return tx.workflowTask.findFirstOrThrow({ where: { instanceId } });
    });
    expect([task.status, task.dueAt?.getTime()]).toEqual(['overdue', past.getTime()]);
  });
});
