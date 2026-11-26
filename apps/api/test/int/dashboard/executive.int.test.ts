import { Decimal } from 'decimal.js';
import { invoiceListResponseSchema, opportunityListResponseSchema } from '@arza/contracts';
import { expect, it } from 'vitest';

import type { Person } from '../iam/support/access-scenario.js';
import { PortalScenario } from '../portal/support/portal-scenario.js';
import { board, drilldown, figure } from './support/dashboard-fixture.js';

// Tablero gerencial (B46, ficha 17.17): las cifras coinciden con las consultas de cada módulo y
// nadie ve por el tablero lo que no puede ver por el listado (decisiones 2 y 3).

const scenario = new PortalScenario('tablero gerencial');

interface People {
  readonly director: Person;
  readonly quality: Person;
  readonly finance: Person;
}

async function people(): Promise<People> {
  return {
    director: await scenario.person('direccion', ['DIRECCION']),
    quality: await scenario.person('calidad', ['CALIDAD']),
    finance: await scenario.person('finanzas', ['ADMIN_FINANCIERO']),
  };
}

async function invoiceBalances(finance: Person): Promise<string> {
  const response = await scenario.get('/v1/finance/invoices', finance.session);
  const open = invoiceListResponseSchema
    .parse(response.body)
    .data.filter((item) => item.status === 'issued' || item.status === 'partially_paid');
  return open.reduce((sum, item) => sum.plus(item.balance ?? '0'), new Decimal(0)).toFixed(2);
}

async function openPipeline(person: Person): Promise<string> {
  const response = await scenario.get('/v1/crm/opportunities?view=open&limit=100', person.session);
  const rows = opportunityListResponseSchema.parse(response.body).data;
  return rows.reduce((sum, row) => sum.plus(row.estimated_value), new Decimal(0)).toFixed(2);
}

it('las cifras coinciden con Finanzas, Comercial y Proyectos', async () => {
  const world = await scenario.deliveryProject();
  await scenario.emittedInvoice(world);
  const p = await people();
  const data = await board(scenario, p.director, 'executive');
  // 1000 de subtotal menos la parte sin IVA de la nota crédito de 200 (200 × 1000 ÷ 1190).
  expect(figure(data, 'sales_month').value).toBe('831.93');
  expect(figure(data, 'sales_year').value).toBe('831.93');
  expect(figure(data, 'receivables_open').value).toBe(await invoiceBalances(p.finance));
  expect(figure(data, 'receivables_overdue').value).toBe('0.00');
  expect(figure(data, 'pipeline_open').value).toBe(await openPipeline(p.director));
  const atRisk = await scenario.inTenant((tx) =>
    tx.prjProject.count({ where: { status: 'at_risk', deletedAt: null } }),
  );
  expect(figure(data, 'projects_at_risk').value).toBe(String(atRisk));
  expect(figure(data, 'satisfaction')).toMatchObject({ value: null, allowed: true });
  const sales = await drilldown(scenario, p.director, 'executive', 'sales_month');
  expect(sales.rows).toHaveLength(2);
  expect(sales.rows.map((row) => row.cells.amount)).toEqual(['$ 1.000', '-$ 168']);
});

it('Calidad ve el tablero pero no las cifras de Finanzas, ni su detalle', async () => {
  const p = await people();
  const data = await board(scenario, p.quality, 'executive');
  expect(figure(data, 'sales_month')).toMatchObject({ allowed: false, value: null });
  expect(figure(data, 'receivables_open')).toMatchObject({ allowed: false, value: null });
  expect(figure(data, 'legal_compliance').allowed).toBe(true);
  const denied = await scenario.get(
    '/v1/dashboards/executive/drilldown?figure=sales_month',
    p.quality.session,
  );
  expect(denied.status).toBe(403);
});

it('otra empresa no ve las ventas de esta', async () => {
  const other = await scenario.person('direccion-otra', ['DIRECCION'], {
    tenantId: scenario.otherTenant.id,
  });
  const data = await board(scenario, other, 'executive');
  expect(figure(data, 'sales_year').value).toBe('0.00');
  const rows = await drilldown(scenario, other, 'executive', 'receivables_open');
  expect(rows.rows).toEqual([]);
});
