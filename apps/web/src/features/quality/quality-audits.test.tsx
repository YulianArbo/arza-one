import type { PermissionCode } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { json, mockApi, noContent, SESSION, type SentRequest } from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { openDialog, sentTo, show } from '../sst/sst-test-support';
import { MyAudits } from './my-quality';
import { AUDIT, IN_PROGRESS, MINOR, OPPORTUNITY, PROGRAM, REPORTED } from './quality-b39-fixtures';
import { QualityAuditDetail } from './quality-audit-detail';
import { QualityAudits } from './quality-audits';
import { ANA, LUIS, ORG_PROCESS, QMS_ID } from './quality-fixtures';

// Programa y auditorías internas (B39): Calidad programa; el auditor asignado ejecuta.

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/calidad/auditorias',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

const QUALITY: readonly PermissionCode[] = [
  'qms.read',
  'qms.audit.plan',
  'qms.audit.execute',
  'qms.action.manage',
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

const DETAIL = `/v1/qms/audits/${AUDIT.id}`;
const MINE = `/v1/qms/my/audits/${AUDIT.id}`;

async function createProgram(): Promise<void> {
  const create = await openDialog('Crear programa anual');
  const field = (label: string) => within(create).getByLabelText(label);
  await userEvent.clear(field('Año'));
  await userEvent.type(field('Año'), '2028');
  await userEvent.type(field('Objetivos'), 'Verificar la eficacia del sistema.');
  await userEvent.type(field('Alcance'), 'Todos los procesos');
  await userEvent.type(field('Criterios'), 'ISO 9001:2015');
  await userEvent.click(within(create).getByRole('button', { name: 'Guardar' }));
}

async function planAudit(): Promise<void> {
  const plan = await openDialog('Programar auditoría');
  const field = (label: string) => within(plan).getByLabelText(label);
  await userEvent.selectOptions(field('Proceso auditado'), ORG_PROCESS.id);
  await userEvent.selectOptions(field('Auditor'), LUIS.id);
  await userEvent.type(field('Fecha programada'), '2027-03-10');
  await userEvent.type(field('Objetivo'), 'Verificar la atención de PQRSF.');
  await userEvent.click(within(plan).getByRole('button', { name: 'Programar' }));
}

async function addFinding(): Promise<void> {
  const finding = await openDialog('Registrar hallazgo');
  const field = (label: string) => within(finding).getByLabelText(label);
  await userEvent.selectOptions(field('Tipo'), 'minor');
  await userEvent.type(field('Requisito'), 'ISO 9001 8.7');
  await userEvent.type(field('Descripción'), 'No hay registro de las salidas.');
  await userEvent.type(field('Evidencia objetiva'), 'Muestra de cinco casos');
  await userEvent.click(within(finding).getByRole('button', { name: 'Registrar' }));
}

it('Calidad crea el programa, lo publica y programa una auditoría', async () => {
  const sent = serve(
    {
      'GET /v1/qms/audit-programs': () => json({ data: [PROGRAM] }),
      'GET /v1/qms/findings': () => json({ data: [MINOR] }),
      'POST /v1/qms/audit-programs': () => json({ id: QMS_ID(90) }, 201),
      [`POST /v1/qms/audit-programs/${PROGRAM.id}/actions/publish`]: () => noContent(),
      'POST /v1/qms/audits': () => json({ id: QMS_ID(91), code: 'AUD-2026-0002' }, 201),
    },
    QUALITY,
  );
  show(<QualityAudits />);
  expect(await screen.findByText('Programa 2027')).toBeInTheDocument();
  expect(screen.getByText('Seguimiento: NC-2026-0010')).toBeInTheDocument();
  await createProgram();
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/qms/audit-programs')?.body).toMatchObject({ year: 2028 });
  });
  await userEvent.click(screen.getByRole('button', { name: 'Publicar el programa 2027' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/publish')?.headers['If-Match']).toBe('"1"');
  });
  await planAudit();
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/qms/audits')?.body).toMatchObject({
      program_id: PROGRAM.id,
      auditor_id: LUIS.id,
      criteria: null,
    });
  });
});

it('el auditor asignado abre su auditoría por Mi espacio y la inicia', async () => {
  const sent = serve(
    {
      [`GET ${MINE}`]: () => json({ audit: AUDIT, findings: [] }),
      [`POST ${DETAIL}/actions/start`]: () => noContent(),
    },
    ['qms.audit.execute'],
  );
  show(<QualityAuditDetail id={AUDIT.id} />);
  expect(await screen.findByText('Auditoría AUD-2026-0001')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cancelar auditoría' })).not.toBeInTheDocument();
  const start = await openDialog('Iniciar auditoría');
  await userEvent.click(within(start).getByRole('button', { name: 'Iniciar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/start')?.headers['If-Match']).toBe('"1"');
  });
});

it('en ejecución, guarda la lista de chequeo completa, registra hallazgos y emite el informe', async () => {
  const sent = serve(
    {
      [`GET ${MINE}`]: () => json({ audit: IN_PROGRESS, findings: [] }),
      [`PUT ${DETAIL}/checklist`]: () => noContent(),
      [`POST ${DETAIL}/findings`]: () => json({ id: QMS_ID(92) }, 201),
      [`POST ${DETAIL}/actions/report`]: () => noContent(),
    },
    ['qms.audit.execute'],
  );
  show(<QualityAuditDetail id={AUDIT.id} />);
  expect(await screen.findByText('Sin registro en octubre')).toBeInTheDocument();
  const add = await openDialog('Agregar pregunta');
  await userEvent.type(within(add).getByLabelText('Requisito o numeral'), 'ISO 9001 9.2');
  await userEvent.type(within(add).getByLabelText('Pregunta'), '¿Hay programa de auditorías?');
  await userEvent.selectOptions(within(add).getByLabelText('Resultado'), 'conforming');
  await userEvent.click(within(add).getByRole('button', { name: 'Guardar' }));
  await vi.waitFor(() => {
    const items = (sentTo(sent, '/checklist')?.body as { items: unknown[] }).items;
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({ requirement: 'ISO 9001 9.2', evidence: null });
  });
  await addFinding();
  await vi.waitFor(() => {
    expect(sentTo(sent, '/findings')?.body).toMatchObject({ type: 'minor' });
  });
  const report = await openDialog('Emitir informe');
  await userEvent.type(
    within(report).getByLabelText('Conclusiones'),
    'Conforme con una excepción.',
  );
  await userEvent.click(within(report).getByRole('button', { name: 'Emitir' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/report')?.headers['If-Match']).toBe('"2"');
  });
});

it('con informe, Calidad cierra, crea la acción de la oportunidad y descarga el PDF', async () => {
  const open = vi.fn();
  vi.stubGlobal('open', open);
  const sent = serve(
    {
      [`GET ${DETAIL}`]: () => json({ audit: REPORTED, findings: [MINOR, OPPORTUNITY] }),
      [`POST ${DETAIL}/actions/close`]: () => noContent(),
      [`POST /v1/qms/findings/${OPPORTUNITY.id}/actions/action`]: () =>
        json({ id: QMS_ID(93), code: 'AC-2026-0020' }, 201),
      [`POST ${DETAIL}/report/download-link`]: () =>
        json({ url: 'https://archivos.test/informe.pdf', expires_at: '2026-12-03T15:05:00.000Z' }),
    },
    QUALITY,
  );
  show(<QualityAuditDetail id={AUDIT.id} />);
  expect(await screen.findByText('Conforme con una excepción.')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Crear acción de mejora' })).toHaveLength(1);
  const action = await openDialog('Crear acción de mejora');
  await userEvent.type(within(action).getByLabelText('Qué se hará'), 'Automatizar el aviso');
  await userEvent.selectOptions(within(action).getByLabelText('Responsable'), ANA.id);
  await userEvent.type(within(action).getByLabelText('Fecha compromiso'), '2027-02-01');
  await userEvent.click(within(action).getByRole('button', { name: 'Crear' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/action')?.body).toMatchObject({ responsible_id: ANA.id });
  });
  await userEvent.click(screen.getByRole('button', { name: 'Cerrar AUD-2026-0001' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/close')?.headers['If-Match']).toBe('"4"');
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Descargar el informe de AUD-2026-0001' }),
  );
  await vi.waitFor(() => {
    expect(open).toHaveBeenCalledWith('https://archivos.test/informe.pdf', '_self');
  });
});

it('Calidad cancela una auditoría programada con el motivo', async () => {
  const sent = serve(
    {
      [`GET ${DETAIL}`]: () => json({ audit: AUDIT, findings: [] }),
      [`POST ${DETAIL}/actions/cancel`]: () => noContent(),
    },
    QUALITY,
  );
  show(<QualityAuditDetail id={AUDIT.id} />);
  const cancel = await openDialog('Cancelar auditoría');
  await userEvent.type(within(cancel).getByLabelText('Motivo'), 'El proceso se fusionó.');
  await userEvent.click(within(cancel).getByRole('button', { name: 'Cancelar auditoría' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/cancel')?.body).toEqual({ reason: 'El proceso se fusionó.' });
  });
});

it('Mi espacio lista las auditorías asignadas y se oculta sin permiso', async () => {
  serve({ 'GET /v1/qms/my/audits': () => json({ data: [AUDIT] }) }, ['qms.audit.execute']);
  show(<MyAudits />);
  expect(await screen.findByRole('link', { name: 'Abrir AUD-2026-0001' })).toBeInTheDocument();
});

it('sin auditorías, el programa y Mi espacio lo dicen', async () => {
  serve(
    {
      'GET /v1/qms/audit-programs': () => json({ data: [] }),
      'GET /v1/qms/findings': () => json({ data: [] }),
      'GET /v1/qms/my/audits': () => json({ data: [] }),
    },
    QUALITY,
  );
  show(
    <>
      <QualityAudits />
      <MyAudits />
    </>,
  );
  expect(await screen.findByText('Aún no hay programas de auditoría.')).toBeInTheDocument();
  expect(await screen.findByText('Aún no hay hallazgos.')).toBeInTheDocument();
  expect(await screen.findByText('No tiene auditorías asignadas.')).toBeInTheDocument();
});
