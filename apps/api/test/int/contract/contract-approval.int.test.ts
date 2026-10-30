import { describe, expect, it } from 'vitest';

import { errorCode, tenantScope } from '../iam/support/iam-fixtures.js';
import { ContractScenario } from './support/contract-scenario.js';

// Control de cláusulas modificadas y aprobación de la Dirección (B24, ficha 17.7). Segundo criterio
// del bloque: una cláusula modificada exige aprobación de la Dirección.

const scenario = new ContractScenario('contratos aprobación');

/** Borrador con la garantía cambiada y una cláusula nueva al final. */
async function modifiedDraft() {
  const sales = await scenario.sales();
  const id = await scenario.contract(sales);
  const clauses = await scenario.clausesOf(sales, id);
  const changed = clauses.map((clause) =>
    clause.clause_key === 'garantia'
      ? { ...clause, body: 'EL CONTRATISTA garantiza durante seis (6) meses lo entregado.' }
      : clause,
  );
  const added = { clause_key: null, title: 'Cláusula penal', body: 'Una pena del 10 % del valor.' };
  const saved = await scenario.saveContract(sales, id, {
    ...scenario.data(),
    clauses: [...changed, added],
  });
  expect(saved.status, saved.text).toBe(204);
  return { sales, id };
}

describe('control de cláusulas modificadas', () => {
  it('marca la cambiada y la nueva, y muestra el texto de la biblioteca para comparar', async () => {
    const { sales, id } = await modifiedDraft();
    const contract = await scenario.contractDetail(sales, id);
    expect(contract.has_modified_clauses).toBe(true);
    const guarantee = contract.clauses.find((clause) => clause.clause_key === 'garantia');
    expect(guarantee).toMatchObject({ origin: 'modified' });
    expect(guarantee?.library_text).toContain('tres (3) meses');
    expect(contract.clauses.at(-1)).toMatchObject({ origin: 'added', clause_key: null });
    expect(contract.clauses.filter((clause) => clause.origin === 'library').length).toBe(
      contract.clauses.length - 2,
    );
  });
});

describe('control de cláusulas modificadas', () => {
  it('no se quita una cláusula obligatoria, pero sí una opcional', async () => {
    const sales = await scenario.sales();
    const id = await scenario.contract(sales);
    const clauses = await scenario.clausesOf(sales, id);
    const without = (key: string) => clauses.filter((clause) => clause.clause_key !== key);
    const optional = await scenario.saveContract(sales, id, {
      ...scenario.data(),
      clauses: without('cesion'),
    });
    expect(optional.status, optional.text).toBe(204);
    expect((await scenario.contractDetail(sales, id)).has_modified_clauses).toBe(false);
    const required = await scenario.saveContract(sales, id, {
      ...scenario.data(),
      clauses: without('confidencialidad').filter((clause) => clause.clause_key !== 'cesion'),
    });
    expect(errorCode(required)).toBe('CONTRACT_CLAUSES_INVALID');
  });
});

describe('una cláusula modificada exige aprobación de la Dirección', () => {
  it('no se aprueba sin revisar una por una las modificadas; revisadas, se aprueba', async () => {
    const { sales, id } = await modifiedDraft();
    expect((await scenario.contractStep(sales, id, 'submit')).status).toBe(204);
    const director = await scenario.director();
    expect(errorCode(await scenario.contractStep(director, id, 'approve', {}))).toBe(
      'CONTRACT_REVIEW_INCOMPLETE',
    );
    const pending = (await scenario.contractDetail(sales, id)).clauses.filter(
      (clause) => clause.origin !== 'library',
    );
    const [first] = pending;
    expect(
      errorCode(
        await scenario.contractStep(director, id, 'approve', { reviewed_clause_ids: [first?.id] }),
      ),
    ).toBe('CONTRACT_REVIEW_INCOMPLETE');
    const approved = await scenario.contractStep(director, id, 'approve', {
      reviewed_clause_ids: pending.map((clause) => clause.id),
      legal_note: 'El asesor revisó la cláusula penal.',
    });
    expect(approved.status, approved.text).toBe(204);
    expect(await scenario.contractDetail(sales, id)).toMatchObject({
      status: 'approved',
      approval: {
        decided_by: { id: director.id },
        legal_note: 'El asesor revisó la cláusula penal.',
      },
    });
  });
});

describe('una cláusula modificada exige aprobación de la Dirección', () => {
  it('desde Mis tareas no se aprueba un contrato con cláusulas modificadas', async () => {
    const { sales, id } = await modifiedDraft();
    await scenario.contractStep(sales, id, 'submit');
    const director = await scenario.director();
    const task = await tenantScope(
      scenario.db,
      scenario.tenant.id,
    )((tx) => tx.workflowTask.findFirstOrThrow({ where: { instance: { entityId: id } } }));
    expect(task.assigneeRole).toBe('DIRECCION');
    const response = await scenario.post(
      `/v1/tasks/${task.id}/actions/complete`,
      director.session,
      {
        action: 'approve',
      },
    );
    expect(errorCode(response)).toBe('CONTRACT_REVIEW_INCOMPLETE');
    expect((await scenario.contractDetail(sales, id)).status).toBe('in_review');
  });
});

describe('aprobación de la Dirección', () => {
  it('un contrato sin cambios se aprueba desde Mis tareas y la tarea se cierra', async () => {
    const sales = await scenario.sales();
    const id = await scenario.contract(sales);
    await scenario.contractStep(sales, id, 'submit');
    const director = await scenario.director();
    const task = await tenantScope(
      scenario.db,
      scenario.tenant.id,
    )((tx) => tx.workflowTask.findFirstOrThrow({ where: { instance: { entityId: id } } }));
    const response = await scenario.post(
      `/v1/tasks/${task.id}/actions/complete`,
      director.session,
      {
        action: 'approve',
        comment: 'Conforme.',
      },
    );
    expect(response.status, response.text).toBeLessThan(300);
    expect(await scenario.contractDetail(sales, id)).toMatchObject({
      status: 'approved',
      pdf: { status: 'pending' },
    });
  });
});

describe('aprobación de la Dirección', () => {
  it('Comercial no aprueba; la Dirección devuelve con comentario y vuelve a borrador', async () => {
    const sales = await scenario.sales();
    const id = await scenario.contract(sales);
    await scenario.contractStep(sales, id, 'submit');
    expect(errorCode(await scenario.contractStep(sales, id, 'approve', {}))).toBe(
      'PERMISSION_DENIED',
    );
    const director = await scenario.director();
    expect((await scenario.contractStep(director, id, 'return', {})).status).toBe(422);
    const back = await scenario.contractStep(director, id, 'return', {
      comment: 'Ajuste la forma de pago.',
    });
    expect(back.status, back.text).toBe(204);
    expect(await scenario.contractDetail(sales, id)).toMatchObject({
      status: 'draft',
      approval: { note: 'Ajuste la forma de pago.' },
    });
  });
});

describe('aprobación de la Dirección', () => {
  it('quien elaboró el contrato no lo aprueba, aunque tenga el rol de Dirección', async () => {
    const both = await scenario.person('comercial-y-direccion', ['COMERCIAL', 'DIRECCION']);
    const id = await scenario.contract(both);
    await scenario.contractStep(both, id, 'submit');
    expect(errorCode(await scenario.contractStep(both, id, 'approve', {}))).toBe(
      'CONTRACT_SELF_APPROVAL',
    );
  });
});

describe('un contrato aprobado no se edita', () => {
  it('tiene su PDF con huella; no cambia ni por la API ni directo en la base de datos', async () => {
    const sales = await scenario.sales();
    const id = await scenario.approvedContract(sales);
    const contract = await scenario.contractDetail(sales, id);
    expect(contract.pdf).toMatchObject({ status: 'ready', file_name: `${contract.code}.pdf` });
    expect(contract.pdf.sha256).toMatch(/^[0-9a-f]{64}$/u);
    const body = { ...scenario.data(), clauses: await scenario.clausesOf(sales, id) };
    expect(errorCode(await scenario.saveContract(sales, id, body))).toBe('CONTRACT_STATUS_INVALID');
    const inTenant = tenantScope(scenario.db, scenario.tenant.id);
    await expect(
      inTenant((tx) => tx.ctrContract.update({ where: { id }, data: { title: 'Otro título' } })),
    ).rejects.toThrow(/ctr_contracts_content_keep|fuera de borrador/u);
    const [first] = contract.clauses;
    await expect(
      inTenant((tx) =>
        tx.ctrContractClause.update({
          where: { id: first?.id ?? '' },
          data: { body: 'Cambiada a mano.' },
        }),
      ),
    ).rejects.toThrow(/ctr_contract_clauses_keep|fuera de borrador/u);
    const link = await scenario.post(`/v1/contracts/${id}/pdf`, sales.session, {
      document: 'generated',
    });
    expect(link.status, link.text).toBe(201);
  });
});
