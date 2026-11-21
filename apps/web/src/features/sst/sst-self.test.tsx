import type { PermissionCode } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { json, noContent } from '../../test-support/fake-api';
import { MySst } from './my-sst';
import { QuickReport } from './quick-report';
import { EXAM, MY_SST, PPE, SST_ID } from './sst-fixtures';
import { sentTo, serveSst, show } from './sst-test-support';

// Lo que cualquier colaborador hace de SST (B37): reportar desde el celular y atender en «Mi
// espacio» lo suyo (elementos por confirmar, autoinspección, acciones, conceptos y quejas).

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/mi-espacio',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

const OWN: readonly PermissionCode[] = ['sst.incident.report', 'hr.employee.read'];
const UPLOAD = 'http://api.test/v1/files/uploads/foto';
const RESULT = { id: SST_ID(30), code: 'RPT-2026-0009', goes_to: 'unsafe_report' };

it('el reporte pide qué pasa y dónde, y luego muestra el código', async () => {
  const sent = serveSst({ 'POST /v1/sst/me/reports': () => json(RESULT, 201) }, OWN);
  show(<QuickReport />);
  await userEvent.click(await screen.findByRole('button', { name: 'Enviar reporte' }));
  expect(await screen.findAllByText(/Qué pasa:/u)).not.toHaveLength(0);
  await userEvent.type(screen.getByLabelText('Qué pasa'), 'Cable suelto en el pasillo.');
  await userEvent.type(screen.getByLabelText('Dónde'), 'Pasillo 3');
  await userEvent.click(screen.getByRole('button', { name: 'Enviar reporte' }));
  expect(await screen.findByText('RPT-2026-0009')).toBeInTheDocument();
  const request = sentTo(sent, '/v1/sst/me/reports');
  expect(request?.body).toMatchObject({ kind: 'unsafe_condition', affected: 'none' });
  expect(request?.headers['Idempotency-Key']).toBeDefined();
  await userEvent.click(screen.getByRole('button', { name: 'Reportar otra cosa' }));
  expect(await screen.findByLabelText('Qué pasa')).toHaveValue('');
});

it('un accidente pide quién se lesionó', async () => {
  const sent = serveSst({ 'POST /v1/sst/me/reports': () => json(RESULT, 201) }, OWN);
  show(<QuickReport />);
  await userEvent.click(await screen.findByLabelText(/Accidente/u));
  await userEvent.type(screen.getByLabelText('Qué pasa'), 'Se golpeó la rodilla en la escalera.');
  await userEvent.type(screen.getByLabelText('Dónde'), 'Escalera');
  await userEvent.click(screen.getByRole('button', { name: 'Enviar reporte' }));
  expect(await screen.findAllByText(/indique quién se lesionó/u)).not.toHaveLength(0);
  await userEvent.click(screen.getByLabelText('Otra persona'));
  await userEvent.click(screen.getByRole('button', { name: 'Enviar reporte' }));
  await vi.waitFor(() => {
    const body = sentTo(sent, '/v1/sst/me/reports')?.body;
    expect(body).toMatchObject({ kind: 'accident', affected: 'other' });
  });
});

function fileList(status: () => string) {
  return () =>
    json({
      data: [
        {
          id: SST_ID(31),
          file_name: 'foto.jpg',
          mime_type: 'image/jpeg',
          size_bytes: 2048,
          sha256: null,
          status: status(),
          rejection: null,
          created_at: '2026-11-20T14:00:00.000Z',
        },
      ],
    });
}

it('espera a que el antivirus deje disponible la foto antes de enviar', async () => {
  let status = 'scanning';
  const link = { id: SST_ID(31), upload_url: UPLOAD, expires_at: '2026-11-20T15:00:00.000Z' };
  const sent = serveSst(
    {
      'POST /v1/sst/me/reports': () => json(RESULT, 201),
      'POST /v1/files': () => json(link, 201),
      'PUT /v1/files/uploads/foto': () => noContent(),
      'GET /v1/files': fileList(() => status),
    },
    OWN,
  );
  show(<QuickReport />);
  await userEvent.type(await screen.findByLabelText('Qué pasa'), 'Cable suelto en el pasillo.');
  await userEvent.type(screen.getByLabelText('Dónde'), 'Pasillo');
  const photo = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
  await userEvent.upload(screen.getByLabelText('Foto (opcional)'), photo);
  expect(await screen.findByText('En análisis')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Esperando la foto…' })).toBeDisabled();
  status = 'available';
  expect(await screen.findByText('Disponible', {}, { timeout: 4000 })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Enviar reporte' }));
  await vi.waitFor(() => {
    const body = sentTo(sent, '/v1/sst/me/reports')?.body;
    expect(body).toMatchObject({ photo_file_id: SST_ID(31) });
  });
});

it('una foto que no sube avisa en español', async () => {
  serveSst({}, OWN);
  show(<QuickReport />);
  const photo = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
  await userEvent.upload(await screen.findByLabelText('Foto (opcional)'), photo);
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo subir el archivo');
});

const COMPLAINT_CREATED = {
  id: SST_ID(32),
  code: 'CCL-2026-0002',
  received_at: '2026-11-20T15:00:00.000Z',
  status: 'received',
};

const SPACE = {
  'GET /v1/sst/me': () => json(MY_SST),
  [`POST /v1/sst/me/ppe-deliveries/${PPE.id}/actions/acknowledge`]: () => noContent(),
  [`POST /v1/sst/me/inspections/${SST_ID(18)}/answers`]: () => noContent(),
  [`POST /v1/sst/investigation-actions/${SST_ID(22)}/actions/complete`]: () => noContent(),
  'POST /v1/sst/me/medical-exams/read': () => json({ data: [EXAM] }),
  'POST /v1/sst/complaints': () => json(COMPLAINT_CREATED, 201),
};

it('en Mi espacio confirma elementos, ve sus conceptos y presenta una queja', async () => {
  const sent = serveSst(SPACE, OWN);
  show(<MySst />);
  expect(await screen.findByText(/RPT-2026-0001/u)).toBeInTheDocument();
  expect(screen.getByText(/Integra: Comité de Convivencia Laboral/u)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar que recibió Reposapiés' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/acknowledge')?.headers['If-Match']).toBe('"1"');
  });
  await userEvent.click(screen.getByRole('button', { name: 'Ver mis conceptos de aptitud' }));
  expect(await screen.findByText(/Restricciones: Evitar levantar/u)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Presentar una queja' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.type(within(dialog).getByLabelText('Qué pasó'), 'Me gritan en las reuniones.');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar al comité' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/sst/complaints')?.headers['Idempotency-Key']).toBeDefined();
  });
});

it('en Mi espacio responde la autoinspección con cada punto', async () => {
  const sent = serveSst(SPACE, OWN);
  show(<MySst />);
  const name = 'Autoinspección del puesto de trabajo en casa';
  const form = await screen.findByRole('form', { name });
  await userEvent.click(within(form).getByRole('button', { name: 'Enviar autoinspección' }));
  expect(await within(form).findByText(/Responda cada punto/u)).toBeInTheDocument();
  await userEvent.type(within(form).getByLabelText('Ciudad y barrio'), 'Bogotá, Suba');
  for (const group of within(form).getAllByRole('group')) {
    await userEvent.click(within(group).getByLabelText('Cumple'));
  }
  await userEvent.click(within(form).getByRole('button', { name: 'Enviar autoinspección' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/answers')?.body).toMatchObject({ place: 'Bogotá, Suba' });
  });
});

it('en Mi espacio marca hecha su acción de una investigación', async () => {
  const sent = serveSst(SPACE, OWN);
  show(<MySst />);
  await userEvent.click(await screen.findByRole('button', { name: 'Marcar hecha' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.type(within(dialog).getByLabelText('Fecha en que se hizo'), '2026-11-20');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Marcar hecha' }));
  await vi.waitFor(() => {
    const body = sentTo(sent, '/actions/complete')?.body;
    expect(body).toMatchObject({ done_on: '2026-11-20', note: null });
  });
});

it('Mi espacio vacío lo dice sin inventar datos', async () => {
  const empty = {
    ...MY_SST,
    reports: [],
    complaints: [],
    ppe: [],
    home_inspections: [],
    actions: [],
    committees: [],
  };
  serveSst(
    {
      'GET /v1/sst/me': () => json(empty),
      'POST /v1/sst/me/medical-exams/read': () => json({ data: [] }),
    },
    OWN,
  );
  show(<MySst />);
  expect(await screen.findByText('No ha hecho reportes.')).toBeInTheDocument();
  expect(screen.getByText('No tiene entregas registradas.')).toBeInTheDocument();
  expect(screen.getByText('No ha presentado quejas.')).toBeInTheDocument();
  expect(screen.queryByText('Mis tareas de SST')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Ver mis conceptos de aptitud' }));
  const none = 'No tiene evaluaciones médicas registradas.';
  expect(await screen.findByText(none)).toBeInTheDocument();
});
