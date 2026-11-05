import { describe, expect, it } from 'vitest';

import type { Person } from '../iam/support/access-scenario.js';
import { errorCode, tenantScope } from '../iam/support/iam-fixtures.js';
import { ContractScenario } from './support/contract-scenario.js';

// Decisiones desde Mis tareas, el acuerdo de confidencialidad y las cláusulas mal armadas (B24):
// la Dirección decide el contrato o el otrosí desde la tarea igual que desde la ficha.

const scenario = new ContractScenario('contratos decisiones');

async function taskOf(entityId: string): Promise<string> {
  const task = await tenantScope(
    scenario.db,
    scenario.tenant.id,
  )((tx) =>
    tx.workflowTask.findFirstOrThrow({
      where: { instance: { entityId }, completedAt: null },
    }),
  );
  return task.id;
}

async function decideTask(entityId: string, action: string, comment: string) {
  const director = await scenario.director();
  const response = await scenario.post(
    `/v1/tasks/${await taskOf(entityId)}/actions/complete`,
    director.session,
    {
      action,
      comment,
    },
  );
  expect(response.status, response.text).toBeLessThan(300);
}

/** Otrosí en revisión sobre un contrato vigente; devuelve el contrato y el otrosí. */
async function amendment(sales: Person): Promise<{ id: string; amendmentId: string }> {
  const id = await scenario.activeContract(sales);
  const amendmentId = await scenario.create(`/v1/contracts/${id}/amendments`, sales, {
    summary: 'Se agrega soporte por seis meses',
    body: 'Las partes acuerdan agregar seis meses de soporte al objeto del contrato.',
    effective_on: scenario.day(0),
    new_ends_on: null,
    new_value: '13000000.00',
  });
  return { id, amendmentId };
}

describe('decisiones desde Mis tareas', () => {
  it('devolver el contrato desde la tarea lo regresa a borrador', async () => {
    const sales = await scenario.sales();
    const id = await scenario.contract(sales);
    expect((await scenario.contractStep(sales, id, 'submit')).status).toBe(204);
    await decideTask(id, 'return', 'Revise el valor.');
    expect((await scenario.contractDetail(sales, id)).status).toBe('draft');
  });

  it('el otrosí se aprueba o se devuelve desde la tarea', async () => {
    const sales = await scenario.sales();
    const approved = await amendment(sales);
    await decideTask(approved.amendmentId, 'approve', 'Conforme.');
    const returned = await amendment(sales);
    await decideTask(returned.amendmentId, 'return', 'Ajuste el valor.');
    const statusOf = async (contractId: string) =>
      (await scenario.contractDetail(sales, contractId)).amendments[0]?.status;
    expect(await statusOf(approved.id)).toBe('approved');
    expect(await statusOf(returned.id)).toBe('returned');
  });
});

describe('acuerdo de confidencialidad', () => {
  it('se aprueba y su PDF se genera con las partes que firman', async () => {
    const sales = await scenario.sales();
    const id = await scenario.approvedContract(sales, {}, 'CT-COM-003');
    expect(await scenario.contractDetail(sales, id)).toMatchObject({
      kind: 'nda',
      pdf: { status: 'ready' },
    });
  });
});

describe('cláusulas', () => {
  it('no se repite una de la biblioteca ni se usa una que no existe', async () => {
    const sales = await scenario.sales();
    const id = await scenario.contract(sales);
    const clauses = await scenario.clausesOf(sales, id);
    const library = clauses.find((clause) => clause.clause_key !== null);
    const missing = { clause_key: 'no-existe', title: 'Cláusula perdida', body: null };
    for (const extra of [library, missing]) {
      const saved = await scenario.saveContract(sales, id, {
        ...scenario.data(),
        clauses: [...clauses, extra],
      });
      expect(errorCode(saved)).toBe('CONTRACT_CLAUSES_INVALID');
    }
    const director = await scenario.director();
    const version = await scenario.post(
      '/v1/contract-clauses/no-existe/versions',
      director.session,
      {
        title: 'Cláusula perdida',
        body: 'Texto de una cláusula que no está en la biblioteca.',
        numbered: true,
        legal_validated: false,
      },
    );
    expect(errorCode(version)).toBe('CONTRACT_NOT_FOUND');
  });
});

describe('obligaciones', () => {
  it('se edita la descripción sin cambiar la fecha', async () => {
    const sales = await scenario.sales();
    const id = await scenario.activeContract(sales);
    const base = `/v1/contracts/${id}/obligations`;
    const body = {
      description: 'Capacitar al equipo del cliente',
      responsible_id: sales.id,
      due_on: scenario.day(30),
    };
    const obligation = await scenario.create(base, sales, body);
    const edited = { ...body, description: 'Capacitar al equipo del cliente en dos sesiones' };
    const response = await scenario.put(`${base}/${obligation}`, sales, edited, 1);
    expect(response.status, response.text).toBe(204);
  });
});
