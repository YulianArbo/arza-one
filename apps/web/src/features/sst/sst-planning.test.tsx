import type { PermissionCode } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { json, noContent } from '../../test-support/fake-api';
import { CHECKLIST, HAZARD, HOME, LUIS, PLAN_ITEM, SST_ID } from './sst-fixtures';
import { SstInspections } from './sst-inspections';
import { SstPlan } from './sst-plan';
import { SstHazards } from './sst-planning';
import { openDialog, sentTo, serveSst, show } from './sst-test-support';

// Matriz de peligros (GTC 45), plan anual con evidencias e inspecciones (B37, decisiones 3, 11 y
// 14).

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/talento-y-sst/sst',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

const SST: readonly PermissionCode[] = [
  'sst.read',
  'sst.hazard.manage',
  'sst.plan.manage',
  'sst.inspection.manage',
];

const PROCESS = {
  id: SST_ID(16),
  parent_id: null,
  code: 'DES',
  name: 'Desarrollo de software',
  kind: 'process',
  owner_position_id: null,
  is_active: true,
  version: 1,
};

it('la matriz muestra el nivel de riesgo', async () => {
  serveSst({ 'GET /v1/sst/hazards': () => json({ data: [HAZARD] }) }, ['sst.read']);
  show(<SstHazards />);
  expect(await screen.findByText(/Nivel I \(600\) · No aceptable/u)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Agregar peligro' })).not.toBeInTheDocument();
});

it('agrega un peligro con los niveles de la guía en números', async () => {
  const sent = serveSst(
    {
      'GET /v1/sst/hazards': () => json({ data: [] }),
      'GET /v1/org-units': () => json({ data: [PROCESS] }),
      'POST /v1/sst/hazards': () => json({ id: SST_ID(40) }, 201),
    },
    SST,
  );
  show(<SstHazards />);
  expect(await screen.findByText('La matriz aún no tiene peligros.')).toBeInTheDocument();
  const dialog = await openDialog('Agregar peligro');
  const field = (label: string) => within(dialog).getByLabelText(label);
  await userEvent.selectOptions(field('Proceso'), SST_ID(16));
  await userEvent.type(field('Actividad o tarea'), 'Atención telefónica');
  await userEvent.selectOptions(field('Clase de peligro'), 'psychosocial');
  await userEvent.type(field('Descripción del peligro'), 'Carga mental alta');
  await userEvent.type(field('Efectos posibles'), 'Estrés');
  await userEvent.selectOptions(field('Nivel de deficiencia'), '2');
  await userEvent.selectOptions(field('Nivel de exposición'), '3');
  await userEvent.selectOptions(field('Nivel de consecuencia'), '10');
  await userEvent.type(field('Próxima revisión'), '2027-06-01');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/sst/hazards')?.body).toMatchObject({
      deficiency: 2,
      exposure: 3,
      consequence: 10,
      existing_controls: null,
    });
  });
});

const PLAN = {
  'GET /v1/sst/work-plan': () =>
    json({
      year: 2026,
      compliance: {
        total: 2,
        done: 1,
        due_to_date: 1,
        done_of_due: 0,
        year_percent: 50,
        to_date_percent: 0,
      },
      data: [PLAN_ITEM, { ...PLAN_ITEM, id: SST_ID(41), done_on: '2026-09-01', overdue: false }],
    }),
  'POST /v1/sst/work-plan': () => json({ id: SST_ID(42) }, 201),
};

it('el plan muestra su cumplimiento y no da por hecha una actividad sin evidencia', async () => {
  serveSst(PLAN, SST);
  show(<SstPlan />);
  expect(await screen.findByText('50 %')).toBeInTheDocument();
  expect(screen.getByText('Vencida')).toBeInTheDocument();
  expect(screen.getByText(/Hecha el 01\/09\/2026 con evidencia/u)).toBeInTheDocument();
  const dialog = await openDialog('Dar por hecha');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Dar por hecha' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('adjunte la evidencia');
});

it('agrega una actividad al plan con su responsable', async () => {
  const sent = serveSst(PLAN, SST);
  show(<SstPlan />);
  const dialog = await openDialog('Agregar actividad');
  await userEvent.type(within(dialog).getByLabelText('Actividad'), 'Capacitación en pausas');
  await userEvent.selectOptions(within(dialog).getByLabelText('Responsable'), LUIS.id);
  await userEvent.type(within(dialog).getByLabelText('Fecha límite'), '2026-12-15');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/sst/work-plan')?.body).toMatchObject({ responsible_id: LUIS.id });
  });
});

const INSPECTIONS = {
  'GET /v1/sst/inspections': () => json({ data: [HOME] }),
  'GET /v1/sst/inspections/checklists/facility': () => json({ kind: 'facility', data: CHECKLIST }),
  'GET /v1/sst/inspections/checklists/emergency': () =>
    json({ kind: 'emergency', data: CHECKLIST }),
  'POST /v1/sst/inspections': () => json({ id: SST_ID(43) }, 201),
  [`POST /v1/sst/inspections/${HOME.id}/actions/review`]: () => noContent(),
};

it('revisa una autoinspección con lo que no cumple a la vista', async () => {
  const sent = serveSst(INSPECTIONS, SST);
  show(<SstInspections />);
  expect(await screen.findByText(/1 puntos sin cumplir/u)).toBeInTheDocument();
  const dialog = await openDialog('Revisar');
  expect(within(dialog).getByText('Silla ajustable')).toBeInTheDocument();
  const findings = within(dialog).getByLabelText('Hallazgos y recomendaciones');
  await userEvent.type(findings, 'Cambiar la silla.');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar revisión' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/review')?.headers['If-Match']).toBe('"2"');
  });
});

it('registra una inspección de emergencias respondiendo cada punto', async () => {
  const sent = serveSst(INSPECTIONS, SST);
  show(<SstInspections />);
  const dialog = await openDialog('Registrar inspección');
  await userEvent.selectOptions(within(dialog).getByLabelText('Tipo'), 'emergency');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar inspección' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('responda cada punto');
  await userEvent.type(within(dialog).getByLabelText('Fecha'), '2026-11-19');
  await userEvent.type(within(dialog).getByLabelText('Lugar'), 'Sede principal');
  for (const group of await within(dialog).findAllByRole('group')) {
    await userEvent.click(within(group).getByLabelText('No aplica'));
  }
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar inspección' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/sst/inspections')?.body).toMatchObject({
      kind: 'emergency',
      findings: null,
    });
  });
});
