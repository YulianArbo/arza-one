import type { Indicator, PermissionCode, StrategicObjective } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { json, mockApi, noContent, SESSION, type SentRequest } from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { openDialog, sentTo, show } from '../sst/sst-test-support';
import { DIR_ID, EVALUATED, EXECUTIVE, SALES_ROWS, SCORECARD } from './direction-fixtures';
import { CompliancePage, ScorecardPage } from './direction-home';
import { Normograma } from './direction-normograma';

// Administración de objetivos estratégicos, historial de evaluaciones y estados del detalle de
// una cifra (B46).

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/direccion',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

const OBJECTIVE: StrategicObjective = {
  id: DIR_ID(60),
  code: 'OBJ-001',
  perspective: 'customer',
  name: 'Clientes más satisfechos',
  description: null,
  year_from: 2026,
  year_to: 2028,
  active: false,
  indicator_ids: [DIR_ID(61)],
  version: 2,
};

function indicator(n: number, code: string): Indicator {
  return {
    id: DIR_ID(n),
    code,
    process: { id: DIR_ID(70), name: 'SAC · Servicio' },
    name: `Indicador ${code}`,
    objective: 'Medir el servicio',
    formula: 'A ÷ B',
    unit: 'percent',
    target: '90',
    direction: 'higher_better',
    frequency: 'monthly',
    source: 'manual',
    responsible: { id: DIR_ID(71), name: 'Luis' },
    active: true,
    last: null,
    pending_period: null,
    version: 1,
  };
}

function serve(routes: object, codes: readonly PermissionCode[]): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(codes)),
    ...routes,
  });
}

it('Calidad registra un objetivo y le cambia los indicadores', async () => {
  const sent = serve(
    {
      'GET /v1/dashboards/scorecard/data': () => json({ ...SCORECARD, scope: 'all' }),
      'GET /v1/qms/strategic-objectives': () => json({ data: [OBJECTIVE] }),
      'GET /v1/qms/indicators': () =>
        json({ data: [indicator(61, 'IND-001'), indicator(62, 'IND-002')] }),
      'POST /v1/qms/strategic-objectives': () => json({ id: DIR_ID(63), code: 'OBJ-002' }, 201),
      [`PUT /v1/qms/strategic-objectives/${OBJECTIVE.id}/indicators`]: () => noContent(),
    },
    ['dashboard.process.read', 'qms.read', 'qms.indicator.manage'],
  );
  show(<ScorecardPage />);
  expect(await screen.findByText(/\(inactivo\)/u)).toBeVisible();
  const dialog = await openDialog('Registrar objetivo');
  await userEvent.type(within(dialog).getByLabelText('Objetivo'), 'Crecer en ventas');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/qms/strategic-objectives')?.body).toMatchObject({
      name: 'Crecer en ventas',
      description: null,
      active: true,
    });
  });
  const links = await openDialog('Indicadores');
  await userEvent.click(within(links).getByRole('checkbox', { name: /IND-001/u }));
  await userEvent.click(within(links).getByRole('checkbox', { name: /IND-002/u }));
  await userEvent.click(within(links).getByRole('button', { name: 'Guardar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/indicators')?.body).toEqual({ indicator_ids: [DIR_ID(62)] });
  });
});

it('sin indicadores de Calidad lo explica al asignar', async () => {
  serve(
    {
      'GET /v1/dashboards/scorecard/data': () => json(SCORECARD),
      'GET /v1/qms/strategic-objectives': () => json({ data: [OBJECTIVE] }),
      'GET /v1/qms/indicators': () => json({ data: [] }),
    },
    ['dashboard.process.read', 'qms.read', 'qms.indicator.manage'],
  );
  show(<ScorecardPage />);
  const links = await openDialog('Indicadores');
  expect(within(links).getByText('Calidad aún no tiene indicadores.')).toBeVisible();
});

it('el historial muestra cada evaluación con su acción', async () => {
  serve(
    {
      'GET /v1/qms/legal-requirements': () =>
        json({ data: [EVALUATED], current_period: 'S2 2026' }),
      [`GET /v1/qms/legal-requirements/${EVALUATED.id}/evaluations`]: () =>
        json({ data: EVALUATED.last_evaluation === null ? [] : [EVALUATED.last_evaluation] }),
    },
    ['qms.read'],
  );
  show(<Normograma />);
  const dialog = await openDialog('Historial');
  expect(await within(dialog).findByText('AC-2026-0007')).toBeVisible();
  expect(within(dialog).getByText('No se encontró el formulario.')).toBeVisible();
});

it('un normograma vacío invita a cargarlo', async () => {
  serve({ 'GET /v1/qms/legal-requirements': () => json({ data: [], current_period: 'S2 2026' }) }, [
    'qms.read',
  ]);
  show(<Normograma />);
  expect(await screen.findByText(/El normograma está vacío/u)).toBeVisible();
});

it('el detalle de una cifra avisa si no hay registros o si se cortó la lista', async () => {
  const counted = {
    ...EXECUTIVE.figures[0],
    key: 'overdue_tasks',
    label: 'Tareas vencidas',
    unit: 'count',
    value: '1234',
  };
  let truncated = false;
  serve(
    {
      'GET /v1/dashboards/compliance/data': () => json({ ...EXECUTIVE, figures: [counted] }),
      'GET /v1/dashboards/compliance/drilldown': () =>
        json(truncated ? { ...SALES_ROWS, truncated: true } : { ...SALES_ROWS, rows: [] }),
    },
    ['dashboard.compliance.read'],
  );
  show(<CompliancePage />);
  expect(await screen.findByText('1.234')).toBeVisible();
  const empty = await openDialog('Ver registros');
  expect(await within(empty).findByText('No hay registros detrás de esta cifra.')).toBeVisible();
  await userEvent.keyboard('{Escape}');
  truncated = true;
  const full = await openDialog('Ver registros');
  expect(await within(full).findByText(/primeros 200/u)).toBeVisible();
});
