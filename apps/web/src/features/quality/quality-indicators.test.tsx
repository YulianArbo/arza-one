import type { PermissionCode } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { json, mockApi, noContent, SESSION, type SentRequest } from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { openDialog, sentTo, show } from '../sst/sst-test-support';
import { MyIndicators } from './my-quality';
import { AUTOMATIC, INDICATOR, MEASUREMENTS } from './quality-b39-fixtures';
import { ANA, LUIS, ORG_PROCESS, QMS_ID } from './quality-fixtures';
import { QualityIndicatorDetail } from './quality-indicator-detail';
import { QualityIndicators } from './quality-indicators';

// Matriz de indicadores, ficha, tendencia y mediciones (B39; RE-SGC-006).

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/calidad/indicadores',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

const QUALITY: readonly PermissionCode[] = [
  'qms.read',
  'qms.indicator.manage',
  'qms.indicator.measure',
];

function serve(routes: object, codes: readonly PermissionCode[]): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(codes)),
    'GET /v1/qms/people': () => json({ data: [ANA, LUIS] }),
    'GET /v1/org-units': () => json({ data: [ORG_PROCESS] }),
    ...routes,
  });
}

it('la matriz muestra meta, resultado y tendencia; crea la ficha y descarga el CSV', async () => {
  const createObjectURL = vi.fn(() => 'blob:matriz');
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
  const csv = new Response('Proceso;Código\r\n', {
    headers: { 'Content-Disposition': 'attachment; filename="matriz-indicadores.csv"' },
  });
  const sent = serve(
    {
      'GET /v1/qms/indicators': () => json({ data: [INDICATOR, AUTOMATIC] }),
      'POST /v1/qms/indicators': () => json({ id: QMS_ID(94), code: 'IND-003' }, 201),
      'POST /v1/qms/indicators/export': () => csv,
    },
    QUALITY,
  );
  show(<QualityIndicators />);
  expect(await screen.findByText('No cumple')).toBeInTheDocument();
  expect(screen.getByText('Baja')).toBeInTheDocument();
  expect(screen.getByText('Sin medición')).toBeInTheDocument();
  const dialog = await openDialog('Crear indicador');
  const field = (label: string) => within(dialog).getByLabelText(label);
  await userEvent.selectOptions(field('Proceso'), ORG_PROCESS.id);
  await userEvent.type(field('Nombre'), 'PQRSF a tiempo');
  await userEvent.type(field('Objetivo'), 'Responder dentro del plazo legal');
  await userEvent.type(field('Fórmula'), 'A tiempo ÷ respondidas');
  await userEvent.selectOptions(field('Fuente'), 'svc_pqrsf_on_time');
  await userEvent.selectOptions(field('Unidad'), 'percent');
  await userEvent.type(field('Meta'), '95');
  await userEvent.selectOptions(field('Responsable'), LUIS.id);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/qms/indicators')?.body).toMatchObject({
      source: 'svc_pqrsf_on_time',
      target: '95',
      active: true,
    });
  });
  await userEvent.click(screen.getByRole('button', { name: 'Descargar matriz (CSV)' }));
  expect(await screen.findByText('Descargamos matriz-indicadores.csv.')).toBeInTheDocument();
});

it('el responsable registra la medición manual del periodo pendiente y la analiza', async () => {
  const sent = serve(
    {
      [`GET /v1/qms/my/indicators/${INDICATOR.id}/series`]: () =>
        json({ indicator: INDICATOR, data: MEASUREMENTS }),
      [`POST /v1/qms/indicators/${INDICATOR.id}/measurements`]: () => json({ id: QMS_ID(95) }, 201),
      [`PATCH /v1/qms/measurements/${MEASUREMENTS[1]?.id ?? ''}`]: () => noContent(),
    },
    ['qms.indicator.measure'],
  );
  show(<QualityIndicatorDetail id={INDICATOR.id} />);
  expect(await screen.findByText(/Falta la medición del periodo/u)).toBeInTheDocument();
  expect(screen.getByRole('table', { name: /Tendencia de IND-001/u })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Calcular ahora' })).not.toBeInTheDocument();
  const record = await openDialog('Registrar medición');
  const field = (label: string) => within(record).getByLabelText(label);
  expect(field('Primer día del periodo')).toHaveValue('2026-10-01');
  await userEvent.type(field('Resultado'), '4.1');
  await userEvent.type(field('Análisis'), 'Mejoró con el nuevo formato');
  await userEvent.type(field('Evidencia'), 'Encuesta de octubre');
  await userEvent.click(within(record).getByRole('button', { name: 'Registrar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/measurements')?.body).toMatchObject({
      period_start: '2026-10-01',
      value: '4.1',
      evidence_file_id: null,
    });
  });
  const analyze = await openDialog('Analizar 10/2026');
  await userEvent.type(within(analyze).getByLabelText('Análisis'), 'Bajó por la rotación.');
  await userEvent.click(within(analyze).getByRole('button', { name: 'Guardar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, `/measurements/${MEASUREMENTS[1]?.id ?? ''}`)?.headers['If-Match']).toBe(
      '"1"',
    );
  });
});

it('Calidad calcula ahora un indicador automático sin pedir periodo', async () => {
  const sent = serve(
    {
      [`GET /v1/qms/indicators/${AUTOMATIC.id}/series`]: () =>
        json({ indicator: AUTOMATIC, data: [] }),
      [`POST /v1/qms/indicators/${AUTOMATIC.id}/actions/calculate`]: () =>
        json({ id: QMS_ID(96) }, 201),
    },
    QUALITY,
  );
  show(<QualityIndicatorDetail id={AUTOMATIC.id} />);
  expect(await screen.findByText('El indicador aún no tiene mediciones.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Registrar medición' })).not.toBeInTheDocument();
  const calc = await openDialog('Calcular ahora');
  await userEvent.click(within(calc).getByRole('button', { name: 'Calcular' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/calculate')?.body).toEqual({});
  });
});

it('Mi espacio dice qué indicador falta por medir', async () => {
  serve({ 'GET /v1/qms/my/indicators': () => json({ data: [INDICATOR, AUTOMATIC] }) }, [
    'qms.indicator.measure',
  ]);
  show(<MyIndicators />);
  expect(
    await screen.findByText(/Falta la medición del periodo que empezó el/u),
  ).toBeInTheDocument();
  expect(screen.getByText('Al día')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Medir IND-001' })).toHaveAttribute(
    'href',
    `/app/calidad/indicadores/${INDICATOR.id}`,
  );
});

it('sin indicadores, la matriz y Mi espacio lo dicen', async () => {
  serve(
    {
      'GET /v1/qms/indicators': () => json({ data: [] }),
      'GET /v1/qms/my/indicators': () => json({ data: [] }),
    },
    QUALITY,
  );
  show(
    <>
      <QualityIndicators />
      <MyIndicators />
    </>,
  );
  expect(await screen.findByText('Aún no hay indicadores.')).toBeInTheDocument();
  expect(await screen.findByText('No tiene indicadores a su cargo.')).toBeInTheDocument();
});
