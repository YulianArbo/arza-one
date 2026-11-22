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
  DETECTED,
  EXECUTED_ACTION,
  LUIS,
  OPEN_ACTION,
  ORG_PROCESS,
  PROCESSES,
  QMS_ID,
  RISK,
  VERIFIED,
} from './quality-fixtures';
import { QualityActions } from './quality-actions';
import { QualityHome } from './quality-home';
import { QualityNonconformities } from './quality-nonconformities';
import { QualityProcesses } from './quality-processes';
import { QualityRisks } from './quality-risks';

// Pantallas de Calidad (B38): reporte de cualquier colaborador, flujo de la no conformidad,
// bitácora con verificación por un tercero, riesgos, mapa de procesos y Mi espacio.

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
  'qms.process.manage',
  'qms.risk.manage',
  'qms.nonconformity.create',
  'qms.nonconformity.manage',
  'qms.nonconformity.close',
  'qms.action.manage',
  'qms.action.verify',
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

it('un colaborador reporta una no conformidad y no ve los indicadores', async () => {
  const sent = serve(
    {
      'GET /v1/qms/my/nonconformities': () => json({ data: [DETECTED] }),
      'POST /v1/qms/nonconformities': () => json({ id: QMS_ID(50), code: 'NC-2026-0009' }, 201),
    },
    ['qms.nonconformity.create'],
  );
  show(<QualityHome />);
  expect(await screen.findByText('NC-2026-0001')).toBeInTheDocument();
  expect(screen.queryByText('No conformidades abiertas')).not.toBeInTheDocument();
  const dialog = await openDialog('Reportar una no conformidad');
  expect(within(dialog).queryByLabelText(/Incidente de SST/u)).not.toBeInTheDocument();
  await userEvent.type(
    within(dialog).getByLabelText('Qué se detectó'),
    'Se envió una factura con error.',
  );
  await userEvent.click(within(dialog).getByRole('button', { name: 'Reportar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/qms/nonconformities')?.body).toMatchObject({
      description: 'Se envió una factura con error.',
      process_id: null,
      sst_incident_id: null,
    });
  });
});

it('muestra el origen enlazado y solo el paso que admite cada estado', async () => {
  const sent = serve(
    {
      'GET /v1/qms/nonconformities': () => json({ data: [DETECTED, ANALYZING, VERIFIED] }),
      [`POST /v1/qms/nonconformities/${DETECTED.id}/actions/contain`]: () => noContent(),
      [`GET /v1/qms/nonconformities/${ANALYZING.id}`]: () => json(DETAIL),
    },
    QUALITY,
  );
  show(<QualityNonconformities />);
  expect(
    await screen.findByText(/Queja o reclamo procedente PQRSF-2026-0007/u),
  ).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Contener' })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: /Registrar el plan/u })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: 'Cerrar como eficaz' })).toHaveLength(1);
  const dialog = await openDialog('Contener');
  const field = (label: string) => within(dialog).getByLabelText(label);
  await userEvent.type(field('Corrección inmediata'), 'Se llamó al cliente.');
  await userEvent.selectOptions(field('Clasificación'), 'major');
  await userEvent.selectOptions(field('Proceso'), ORG_PROCESS.id);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar contención' }));
  await vi.waitFor(() => {
    const request = sentTo(sent, '/actions/contain');
    expect(request?.body).toMatchObject({ classification: 'major', process_id: ORG_PROCESS.id });
    expect(request?.headers['If-Match']).toBe('"1"');
  });
  await userEvent.click(screen.getByRole('button', { name: 'Ver el detalle de NC-2026-0002' }));
  expect(await screen.findByText('No había quién')).toBeInTheDocument();
});

it('el análisis con los cinco porqués envía solo los porqués escritos', async () => {
  const sent = serve(
    {
      'GET /v1/qms/nonconformities': () => json({ data: [ANALYZING] }),
      [`POST /v1/qms/nonconformities/${ANALYZING.id}/actions/analyze`]: () => noContent(),
    },
    QUALITY,
  );
  show(<QualityNonconformities />);
  const dialog = await openDialog('Analizar causa');
  const field = (label: string) => within(dialog).getByLabelText(label);
  await userEvent.selectOptions(field('Método'), 'five_whys');
  await userEvent.type(field('¿Por qué? 1 (cinco porqués)'), 'No se revisó');
  await userEvent.type(field('¿Por qué? 2 (cinco porqués)'), 'No había lista');
  await userEvent.type(field('Causa raíz'), 'El procedimiento no exige la lista.');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar análisis' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/analyze')?.body).toEqual({
      analysis: { method: 'five_whys', whys: ['No se revisó', 'No había lista'] },
      root_cause: 'El procedimiento no exige la lista.',
    });
  });
});

it('la bitácora marca la vencida y la verificación envía el resultado', async () => {
  const sent = serve(
    {
      'GET /v1/qms/actions': () => json({ data: [OPEN_ACTION, EXECUTED_ACTION] }),
      [`POST /v1/qms/actions/${EXECUTED_ACTION.id}/actions/verify`]: () => noContent(),
    },
    QUALITY,
  );
  show(<QualityActions />);
  expect(await screen.findByText('Vencida')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Verificar eficacia' })).toHaveLength(1);
  const dialog = await openDialog('Verificar eficacia');
  const field = (label: string) => within(dialog).getByLabelText(label);
  await userEvent.selectOptions(field('Resultado'), 'false');
  await userEvent.type(field('Cómo se verificó'), 'El error se repitió.');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar verificación' }));
  await vi.waitFor(() => {
    const request = sentTo(sent, '/actions/verify');
    expect(request?.body).toMatchObject({ effective: false, note: 'El error se repitió.' });
    expect(request?.headers['If-Match']).toBe('"2"');
  });
});

it('la matriz de riesgos muestra el nivel y registra con números', async () => {
  const sent = serve(
    {
      'GET /v1/qms/risks': () => json({ data: [RISK] }),
      'POST /v1/qms/risks': () => json({ id: QMS_ID(60) }, 201),
    },
    QUALITY,
  );
  show(<QualityRisks />);
  expect(await screen.findByText(/Crítico \(4 × 5 = 20\)/u)).toBeInTheDocument();
  const dialog = await openDialog('Registrar riesgo u oportunidad');
  const field = (label: string) => within(dialog).getByLabelText(label);
  await userEvent.selectOptions(field('Tipo'), 'risk');
  await userEvent.selectOptions(field('Proceso'), ORG_PROCESS.id);
  await userEvent.type(field('Descripción'), 'Rotación del equipo');
  await userEvent.selectOptions(field('Probabilidad'), '3');
  await userEvent.selectOptions(field('Impacto'), '2');
  await userEvent.selectOptions(field('Tratamiento (una oportunidad se aprovecha)'), 'mitigate');
  await userEvent.selectOptions(field('Responsable'), ANA.id);
  await userEvent.type(field('Próxima revisión'), '2027-03-01');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/qms/risks')?.body).toMatchObject({
      probability: 3,
      impact: 2,
      causes: null,
      status: 'active',
    });
  });
});

it('el mapa agrupa los procesos por tipo y señala los que no tienen caracterización', async () => {
  serve({ 'GET /v1/qms/processes': () => json({ data: PROCESSES }) }, ['qms.read']);
  show(<QualityProcesses />);
  expect(await screen.findByRole('heading', { name: 'Procesos misionales' })).toBeInTheDocument();
  expect(screen.getByText('Sin caracterización')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Caracterizar' })).not.toBeInTheDocument();
});

it('en Mi espacio la persona marca ejecutada su acción con la evidencia', async () => {
  const sent = serve(
    {
      'GET /v1/qms/my/actions': () => json({ data: [OPEN_ACTION] }),
      [`POST /v1/qms/actions/${OPEN_ACTION.id}/actions/execute`]: () => noContent(),
    },
    ['qms.action.manage'],
  );
  show(<MyQualityActions />);
  expect(await screen.findByText('Asignar quién revisa el informe.')).toBeInTheDocument();
  const dialog = await openDialog('Marcar ejecutada');
  const note = within(dialog).getByLabelText('Qué se hizo y dónde está la evidencia');
  await userEvent.type(note, 'Se actualizó el procedimiento PR-SAC-002.');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar ejecución' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/execute')?.body).toMatchObject({
      evidence_note: 'Se actualizó el procedimiento PR-SAC-002.',
      evidence_file_id: null,
    });
  });
});
