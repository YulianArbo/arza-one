import { describe, expect, it } from 'vitest';

import type { Person } from '../iam/support/access-scenario.js';
import { tenantScope } from '../iam/support/iam-fixtures.js';
import { QuoteScenario, item } from './support/quote-scenario.js';

// La Dirección decide la cotización desde Mis tareas (B23): el trámite cambia la cotización con
// ella, igual que si decidiera desde la ficha.

const scenario = new QuoteScenario('crm cotizaciones desde tareas');

/** Cotización con descuento sobre el tope, enviada a aprobación; devuelve su tarea. */
async function pendingApproval(sales: Person): Promise<{ id: string; taskId: string }> {
  const id = await scenario.quote(sales, { items: [item({ discount_percent: '25' })] });
  expect((await scenario.step(sales, id, 'submit')).status).toBe(204);
  const task = await tenantScope(
    scenario.db,
    scenario.tenant.id,
  )((tx) => tx.workflowTask.findFirstOrThrow({ where: { instance: { entityId: id } } }));
  return { id, taskId: task.id };
}

describe('decidir la cotización desde Mis tareas', () => {
  it('aprobar desde la tarea aprueba la cotización y deja su nota', async () => {
    const sales = await scenario.sales();
    const { id, taskId } = await pendingApproval(sales);
    const director = await scenario.director();
    const response = await scenario.post(`/v1/tasks/${taskId}/actions/complete`, director.session, {
      action: 'approve',
      comment: 'Aprobada desde Mis tareas.',
    });
    expect(response.status, response.text).toBe(204);
    expect(await scenario.quoteDetail(sales, id)).toMatchObject({
      status: 'approved',
      approval: { decided_by: { id: director.id }, note: 'Aprobada desde Mis tareas.' },
    });
  });

  it('devolver desde la tarea regresa la cotización a borrador con el motivo', async () => {
    const sales = await scenario.sales();
    const { id, taskId } = await pendingApproval(sales);
    const director = await scenario.director();
    const response = await scenario.post(`/v1/tasks/${taskId}/actions/complete`, director.session, {
      action: 'return',
      comment: 'Baje el descuento.',
    });
    expect(response.status, response.text).toBe(204);
    expect(await scenario.quoteDetail(sales, id)).toMatchObject({
      status: 'draft',
      approval: { note: 'Baje el descuento.' },
    });
  });
});
