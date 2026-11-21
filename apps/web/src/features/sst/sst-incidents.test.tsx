import type { PermissionCode, SstIncidentDetail } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { json, noContent } from '../../test-support/fake-api';
import { ACCIDENT, INVESTIGATING, LUIS, PLANNED, UNSAFE } from './sst-fixtures';
import { SstIncidents } from './sst-incidents';
import { openDialog, sentTo, serveSst, show } from './sst-test-support';

// Incidentes con su plazo para la ARL y los pasos de la investigación; actos y condiciones
// inseguras (B37, decisiones 5 y 6).

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/talento-y-sst/sst/incidentes',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

const SST: readonly PermissionCode[] = [
  'sst.read',
  'sst.incident.investigate',
  'sst.incident.close',
];

function summary(detail: SstIncidentDetail) {
  return {
    id: detail.id,
    code: detail.code,
    kind: detail.kind,
    status: detail.status,
    occurred_at: detail.occurred_at,
    location: detail.location,
    affected: detail.affected,
    affected_employee: detail.affected_employee,
    reported_by: detail.reported_by,
    arl_due_on: detail.arl_due_on,
    arl_reported_on: detail.arl_reported_on,
    arl_overdue: detail.arl_overdue,
    version: detail.version,
  };
}

const ROUTES = {
  'GET /v1/sst/incidents': () =>
    json({ data: [summary(ACCIDENT), summary(INVESTIGATING), summary(PLANNED)] }),
  'GET /v1/sst/unsafe-reports': () => json({ data: [UNSAFE] }),
  [`GET /v1/sst/incidents/${PLANNED.id}`]: () => json(PLANNED),
  [`POST /v1/sst/incidents/${ACCIDENT.id}/actions/report-arl`]: () => noContent(),
  [`POST /v1/sst/incidents/${ACCIDENT.id}/actions/investigate`]: () => noContent(),
  [`POST /v1/sst/incidents/${INVESTIGATING.id}/actions/plan`]: () => noContent(),
  [`POST /v1/sst/incidents/${PLANNED.id}/actions/close`]: () => noContent(),
  [`POST /v1/sst/unsafe-reports/${UNSAFE.id}/actions/attend`]: () => noContent(),
};

it('muestra el plazo vencido de la ARL y registra el radicado', async () => {
  const sent = serveSst(ROUTES, SST);
  show(<SstIncidents />);
  expect(
    await screen.findByText(/ARL: reportar a más tardar el 20\/11\/2026/u),
  ).toBeInTheDocument();
  const dialog = await openDialog('Registrar reporte a la ARL');
  await userEvent.type(within(dialog).getByLabelText('Fecha del reporte'), '2026-11-19');
  await userEvent.type(within(dialog).getByLabelText('Número de radicado del FURAT'), 'FURAT-77');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/report-arl')?.body).toEqual({
      reported_on: '2026-11-19',
      filing_number: 'FURAT-77',
    });
  });
});

it('abre la investigación y registra el plan con sus acciones', async () => {
  const sent = serveSst(ROUTES, SST);
  show(<SstIncidents />);
  let dialog = await openDialog('Investigar');
  await userEvent.type(within(dialog).getByLabelText('Equipo investigador'), 'SST y jefe');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Abrir investigación' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/investigate')?.body).toEqual({
      team: 'SST y jefe',
      affected_employee_id: null,
    });
  });
  dialog = await openDialog('Registrar plan');
  await userEvent.type(within(dialog).getByLabelText('Causas inmediatas'), 'Soporte suelto.');
  await userEvent.type(within(dialog).getByLabelText('Causas básicas o raíz'), 'Sin revisiones.');
  await userEvent.type(within(dialog).getByLabelText('Acción 1'), 'Ajustar soportes');
  await userEvent.selectOptions(within(dialog).getByLabelText('Responsable 1'), LUIS.id);
  await userEvent.type(within(dialog).getByLabelText('Fecha límite 1'), '2026-11-30');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar plan' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/plan')?.body).toMatchObject({
      actions: [{ description: 'Ajustar soportes', responsible_id: LUIS.id, due_on: '2026-11-30' }],
    });
  });
});

it('muestra el detalle con las acciones hechas y cierra el incidente', async () => {
  const sent = serveSst(ROUTES, SST);
  show(<SstIncidents />);
  await userEvent.click(
    await screen.findByRole('button', { name: `Ver el detalle de ${PLANNED.code}` }),
  );
  expect(await screen.findByText(/hecha el 20\/11\/2026/u)).toBeInTheDocument();
  const dialog = await openDialog('Cerrar');
  const conclusion = within(dialog).getByLabelText('Conclusión y lecciones aprendidas');
  await userEvent.type(conclusion, 'Se aseguraron los soportes.');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cerrar incidente' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/close')?.headers['If-Match']).toBe('"3"');
  });
});

it('atiende un reporte de condición insegura', async () => {
  const sent = serveSst(ROUTES, SST);
  show(<SstIncidents />);
  const dialog = await openDialog('Atender');
  await userEvent.selectOptions(within(dialog).getByLabelText('Estado'), 'closed');
  const response = within(dialog).getByLabelText('Qué se hizo o qué se hará');
  await userEvent.type(response, 'Se aseguró el cable.');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/attend')?.body).toEqual({
      status: 'closed',
      response: 'Se aseguró el cable.',
    });
  });
});

it('quien solo lee no ve los pasos de la investigación', async () => {
  const reported = { ...ACCIDENT, arl_reported_on: '2026-11-19', arl_overdue: false };
  serveSst(
    {
      'GET /v1/sst/incidents': () => json({ data: [summary(reported)] }),
      'GET /v1/sst/unsafe-reports': () => json({ data: [] }),
    },
    ['sst.read'],
  );
  show(<SstIncidents />);
  expect(await screen.findByText(/ARL: reportado el 19\/11\/2026/u)).toBeInTheDocument();
  expect(screen.getByText('No hay reportes.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Investigar' })).not.toBeInTheDocument();
});
