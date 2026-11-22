import type { PermissionCode } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { json, mockApi, noContent, SESSION, type SentRequest } from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { openDialog, sentTo, show } from '../sst/sst-test-support';
import { MyQualityActions } from './my-quality';
import {
  ANA,
  ANALYZING,
  DETAIL,
  EXECUTED_ACTION,
  LUIS,
  OPEN_ACTION,
  ORG_PROCESS,
  QMS_ID,
  VERIFIED,
} from './quality-fixtures';
import { QualityActions } from './quality-actions';
import { QualityNonconformities } from './quality-nonconformities';

// Espina de pescado, acciones de la no conformidad, plan, reapertura, acciones de mejora y
// descarga de la bitácora (B38).

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/calidad',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

const QUALITY: readonly PermissionCode[] = [
  'qms.read',
  'qms.nonconformity.manage',
  'qms.nonconformity.close',
  'qms.action.manage',
  'qms.action.verify',
];

function serve(routes: object): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(QUALITY)),
    'GET /v1/qms/people': () => json({ data: [ANA, LUIS] }),
    'GET /v1/org-units': () => json({ data: [ORG_PROCESS] }),
    ...routes,
  });
}

const ISHIKAWA_DETAIL = {
  ...DETAIL,
  nonconformity: {
    ...DETAIL.nonconformity,
    analysis: {
      method: 'ishikawa',
      causes: {
        method: ['Sin procedimiento'],
        machine: [],
        materials: [],
        manpower: ['Sin capacitación', 'Rotación'],
        measurement: [],
        environment: [],
      },
    },
  },
};

it('la espina de pescado envía solo las categorías con causa y se ve en el detalle', async () => {
  const step = `/v1/qms/nonconformities/${ANALYZING.id}/actions`;
  const sent = serve({
    'GET /v1/qms/nonconformities': () => json({ data: [ANALYZING] }),
    [`POST ${step}/analyze`]: () => noContent(),
    [`GET /v1/qms/nonconformities/${ANALYZING.id}`]: () => json(ISHIKAWA_DETAIL),
  });
  show(<QualityNonconformities />);
  const dialog = await openDialog('Analizar causa');
  const field = (label: string) => within(dialog).getByLabelText(label);
  await userEvent.selectOptions(field('Método'), 'ishikawa');
  await userEvent.type(field('Método (espina de pescado)'), 'Sin procedimiento');
  await userEvent.type(field('Causa raíz'), 'No hay procedimiento escrito.');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar análisis' }));
  await vi.waitFor(() => {
    const analysis = sentTo(sent, '/actions/analyze')?.body;
    expect(analysis).toMatchObject({
      analysis: { method: 'ishikawa', causes: { method: ['Sin procedimiento'], machine: [] } },
    });
  });
  await userEvent.click(screen.getByRole('button', { name: 'Ver el detalle de NC-2026-0002' }));
  expect(await screen.findByText('Mano de obra: Sin capacitación; Rotación')).toBeInTheDocument();
  expect(screen.queryByText(/Máquina:/u)).not.toBeInTheDocument();
});

it('agrega una acción correctiva, registra el plan y reabre la verificada', async () => {
  const step = (id: string, name: string) => `POST /v1/qms/nonconformities/${id}/actions/${name}`;
  const sent = serve({
    'GET /v1/qms/nonconformities': () => json({ data: [ANALYZING, VERIFIED] }),
    'POST /v1/qms/actions': () => json({ id: QMS_ID(80), code: 'AC-2026-0009' }, 201),
    [step(ANALYZING.id, 'plan')]: () => noContent(),
    [step(VERIFIED.id, 'reopen')]: () => noContent(),
  });
  show(<QualityNonconformities />);
  const [first] = await screen.findAllByRole('button', { name: 'Agregar acción' });
  if (first === undefined) throw new Error('Falta el botón de agregar acción');
  await userEvent.click(first);
  const dialog = await screen.findByRole('dialog');
  const field = (label: string) => within(dialog).getByLabelText(label);
  await userEvent.type(field('Qué se hará'), 'Escribir el procedimiento de revisión');
  await userEvent.selectOptions(field('Responsable'), ANA.id);
  await userEvent.type(field('Fecha compromiso'), '2026-12-15');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar acción' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/qms/actions')?.body).toMatchObject({
      origin_type: 'nonconformity',
      origin_id: ANALYZING.id,
      notes: null,
    });
  });
  await userEvent.click(screen.getByRole('button', { name: /Registrar el plan/u }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/plan')?.headers['If-Match']).toBe('"3"');
  });
  const reopen = await openDialog('Reabrir');
  await userEvent.type(within(reopen).getByLabelText('Por qué no fue eficaz'), 'El error volvió.');
  await userEvent.click(within(reopen).getByRole('button', { name: 'Reabrir' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/reopen')?.body).toEqual({ reason: 'El error volvió.' });
  });
});

it('registra una acción de mejora y descarga la bitácora en CSV', async () => {
  const createObjectURL = vi.fn(() => 'blob:bitacora');
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
  const csv = new Response('Código;Origen\r\n', {
    headers: { 'Content-Disposition': 'attachment; filename="bitacora-acciones.csv"' },
  });
  const sent = serve({
    'GET /v1/qms/actions': () => json({ data: [EXECUTED_ACTION] }),
    'POST /v1/qms/actions': () => json({ id: QMS_ID(81), code: 'AC-2026-0010' }, 201),
    'POST /v1/qms/actions/export': () => csv,
  });
  show(<QualityActions />);
  const dialog = await openDialog('Registrar acción de mejora');
  const field = (label: string) => within(dialog).getByLabelText(label);
  await userEvent.type(field('Qué se hará'), 'Automatizar el recordatorio');
  await userEvent.selectOptions(field('Responsable'), LUIS.id);
  await userEvent.type(field('Fecha compromiso'), '2027-01-31');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/qms/actions')?.body).toMatchObject({
      origin_type: 'improvement',
      origin_id: null,
    });
  });
  await userEvent.click(screen.getByRole('button', { name: 'Descargar bitácora (CSV)' }));
  expect(await screen.findByText('Descargamos bitacora-acciones.csv.')).toBeInTheDocument();
  expect(createObjectURL).toHaveBeenCalledOnce();
});

it('en Mi espacio una mejora sin origen muestra su estado', async () => {
  const improvement = { ...OPEN_ACTION, id: QMS_ID(82), origin: null, overdue: false };
  serve({ 'GET /v1/qms/my/actions': () => json({ data: [improvement] }) });
  show(<MyQualityActions />);
  expect(await screen.findByText('Abierta')).toBeInTheDocument();
  expect(screen.queryByText('Vencida')).not.toBeInTheDocument();
});
