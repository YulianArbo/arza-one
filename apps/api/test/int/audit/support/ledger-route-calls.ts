import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import {
  FIN,
  createdId,
  expenseBody,
  keyed,
  ledgerBasics,
  movementBody,
  pettyCashOpen,
  putVersioned,
  versioned,
} from '../../fin/support/ledger-steps.js';
import { day } from './contract-steps.js';
import { running, type RouteCall } from './project-route-calls.js';

// Llamadas del recorrido de escrituras (B11) para Finanzas (B32): presupuesto, gastos, caja menor,
// conciliación, certificación de costos, cierre de periodo y exportación. Todas comparten la empresa
// del recorrido, así que cada una usa su propio año, cuenta o mes. Datos ficticios.

interface Team {
  readonly finance: Person;
  readonly approver: Person;
  readonly costCenterId: string;
}

async function team(s: AccessScenario): Promise<Team> {
  const { costCenterId } = await ledgerBasics(s);
  return {
    finance: await s.person('finanzas-b32-recorrido', ['ADMIN_FINANCIERO']),
    approver: await s.person('aprobador-b32-recorrido', ['ADMIN_FINANCIERO']),
    costCenterId,
  };
}

async function budget(s: AccessScenario, t: Team, year: number): Promise<string> {
  return createdId(s.post(`${FIN}/budgets`, t.finance.session, { year }));
}

function lines(t: Team): object {
  return {
    lines: [{ cost_center_id: t.costCenterId, category: 'OFFICE', month: 3, planned: '100.00' }],
  };
}

async function expense(s: AccessScenario, t: Team): Promise<string> {
  const body = await expenseBody(s, t.finance, t.costCenterId, day(s, 0), '50.00');
  return createdId(keyed(s, t.finance, `${FIN}/expenses`, body));
}

function reconciliation(account: string): object {
  return {
    account,
    period: '2002-02',
    book_balance: '100.00',
    bank_balance: '90.00',
    differences: [{ description: 'Comisión ficticia', amount: '-10.00' }],
  };
}

async function draftReconciliation(s: AccessScenario, t: Team, account: string): Promise<string> {
  return createdId(
    s.post(`${FIN}/bank-reconciliations`, t.finance.session, reconciliation(account)),
  );
}

async function certifiableProject(s: AccessScenario, approverId: string): Promise<string> {
  const crew = await running(s);
  await s.inTenant((tx) =>
    tx.prjTimeEntry.create({
      data: {
        tenantId: s.tenant.id,
        projectId: crew.id,
        userId: crew.leader.id,
        workDate: new Date(`${day(s, 0)}T00:00:00.000Z`),
        hours: '2.00',
        status: 'approved',
        decidedBy: approverId,
        decidedAt: new Date(),
      },
    }),
  );
  return crew.id;
}

export const LEDGER_ROUTE_CALLS: Record<string, RouteCall> = {
  'POST /v1/finance/budgets': async (s) => {
    const t = await team(s);
    return { test: s.post(`${FIN}/budgets`, t.finance.session, { year: 2091 }) };
  },
  'PUT /v1/finance/budgets/{id}/lines': async (s) => {
    const t = await team(s);
    const id = await budget(s, t, 2092);
    return { test: putVersioned(s, `${FIN}/budgets/${id}/lines`, t.finance, lines(t), 1) };
  },
  'POST /v1/finance/budgets/{id}/approval': async (s) => {
    const t = await team(s);
    const id = await budget(s, t, 2093);
    await putVersioned(s, `${FIN}/budgets/${id}/lines`, t.finance, lines(t), 1).expect(204);
    return { test: versioned(s.post(`${FIN}/budgets/${id}/approval`, t.approver.session), 2) };
  },
  'POST /v1/finance/expenses': async (s) => {
    const t = await team(s);
    const body = await expenseBody(s, t.finance, t.costCenterId, day(s, 0), '75.00');
    return { test: keyed(s, t.finance, `${FIN}/expenses`, body) };
  },
  'POST /v1/finance/expenses/{id}/approval': async (s) => {
    const t = await team(s);
    const id = await expense(s, t);
    return { test: versioned(s.post(`${FIN}/expenses/${id}/approval`, t.approver.session), 1) };
  },
  'POST /v1/finance/expenses/{id}/rejection': async (s) => {
    const t = await team(s);
    const id = await expense(s, t);
    const reason = { reason: 'Rechazo del recorrido' };
    return {
      test: versioned(s.post(`${FIN}/expenses/${id}/rejection`, t.approver.session, reason), 1),
    };
  },
  'POST /v1/finance/petty-cash/movements': async (s) => {
    const t = await team(s);
    await pettyCashOpen(s, t.finance, day(s, 0));
    const body = movementBody('voucher', '10.00', day(s, 0), t.costCenterId);
    return { test: keyed(s, t.finance, `${FIN}/petty-cash/movements`, body) };
  },
  'POST /v1/finance/bank-reconciliations': async (s) => {
    const t = await team(s);
    const body = reconciliation('Banco recorrido ···0001');
    return { test: s.post(`${FIN}/bank-reconciliations`, t.finance.session, body) };
  },
  'PUT /v1/finance/bank-reconciliations/{id}': async (s) => {
    const t = await team(s);
    const id = await draftReconciliation(s, t, 'Banco recorrido ···0002');
    const body = reconciliation('Banco recorrido ···0002');
    return { test: putVersioned(s, `${FIN}/bank-reconciliations/${id}`, t.finance, body, 1) };
  },
  'POST /v1/finance/bank-reconciliations/{id}/close': async (s) => {
    const t = await team(s);
    const id = await draftReconciliation(s, t, 'Banco recorrido ···0003');
    const close = s.post(`${FIN}/bank-reconciliations/${id}/close`, t.finance.session);
    return { test: versioned(close, 1) };
  },
  'POST /v1/finance/cost-certifications': async (s) => {
    const t = await team(s);
    const projectId = await certifiableProject(s, t.approver.id);
    const body = {
      project_id: projectId,
      period: day(s, 0).slice(0, 7),
      amount: '10.00',
      phase: 'research',
    };
    return { test: keyed(s, t.finance, `${FIN}/cost-certifications`, body) };
  },
  'POST /v1/finance/periods/close': async (s) => {
    const t = await team(s);
    return { test: s.post(`${FIN}/periods/close`, t.finance.session, { period: '2001-01' }) };
  },
  'POST /v1/finance/exports/accounting': async (s) => {
    const t = await team(s);
    return { test: s.post(`${FIN}/exports/accounting`, t.finance.session, { period: '2003-03' }) };
  },
};
