import type { ContextItem, Lesson, PermissionCode, Stakeholder } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { json, mockApi, SESSION, type SentRequest } from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { currentYear } from '../sst/sst-options';
import { openDialog, sentTo, show } from '../sst/sst-test-support';
import {
  ANA,
  ANALYZING,
  DETECTED,
  EXECUTED_ACTION,
  OPEN_ACTION,
  ORG_PROCESS,
  QMS_ID,
  RISK,
  VERIFIED,
} from './quality-fixtures';
import { QualityContext } from './quality-context';
import { QualityHome } from './quality-home';
import { QualityLessons } from './quality-lessons';

// Portada con indicadores, contexto DOFA-PESTEL, partes interesadas y lecciones (B38).

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/calidad',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

const MANAGER: readonly PermissionCode[] = [
  'qms.read',
  'qms.process.manage',
  'qms.nonconformity.create',
  'qms.nonconformity.manage',
];

function serve(routes: object, codes: readonly PermissionCode[]): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(codes)),
    'GET /v1/org-units': () => json({ data: [ORG_PROCESS] }),
    'GET /v1/sst/incidents': () => json({ data: [] }),
    ...routes,
  });
}

const STRENGTH: ContextItem = {
  id: QMS_ID(70),
  kind: 'strength',
  pestel_factor: null,
  description: 'Equipo con experiencia en soporte',
  impact: 'high',
  year: currentYear(),
  version: 1,
};
const THREAT: ContextItem = {
  ...STRENGTH,
  id: QMS_ID(71),
  kind: 'threat',
  pestel_factor: 'economic',
  description: 'Alza del dólar',
  impact: 'medium',
};
const CLIENTS: Stakeholder = {
  id: QMS_ID(72),
  name: 'Clientes',
  stakeholder_type: 'external',
  needs: 'Soporte oportuno',
  expectations: 'Respuesta en 24 horas',
  monitoring: 'Encuesta trimestral',
  version: 1,
};
const STAFF: Stakeholder = { ...CLIENTS, id: QMS_ID(73), name: 'Personal', monitoring: null };
const LESSON: Lesson = {
  id: QMS_ID(74),
  title: 'Revisar las facturas antes de enviarlas',
  context: 'Se envió una factura con error.',
  lesson: 'Una segunda persona revisa.',
  process: { id: ORG_PROCESS.id, name: 'SAC · Servicio al Cliente' },
  nonconformity: { id: DETECTED.id, code: DETECTED.code },
  recorded_by: ANA,
  recorded_on: '2026-11-20',
  version: 1,
};

it('la portada cuenta abiertas, vencidas, por verificar y riesgos altos', async () => {
  serve(
    {
      'GET /v1/qms/nonconformities': () => json({ data: [DETECTED, ANALYZING, VERIFIED] }),
      'GET /v1/qms/actions': () => json({ data: [OPEN_ACTION, EXECUTED_ACTION] }),
      'GET /v1/qms/risks': () => json({ data: [RISK, { ...RISK, id: QMS_ID(75), level: 'low' }] }),
      'GET /v1/qms/my/nonconformities': () => json({ data: [] }),
    },
    MANAGER,
  );
  show(<QualityHome />);
  const card = (label: string): HTMLElement => {
    const section = screen.getByRole('heading', { name: label }).closest('section');
    if (section === null) throw new Error(`Falta el indicador ${label}`);
    return section;
  };
  expect(await screen.findByText('Aún no ha reportado no conformidades.')).toBeInTheDocument();
  await vi.waitFor(() => {
    expect(within(card('No conformidades abiertas')).getByText('3')).toBeInTheDocument();
    expect(within(card('Acciones vencidas')).getByText('1')).toBeInTheDocument();
    expect(within(card('Acciones por verificar')).getByText('1')).toBeInTheDocument();
    expect(within(card('Riesgos altos o críticos')).getByText('1')).toBeInTheDocument();
  });
  expect(screen.getByRole('link', { name: 'Lecciones aprendidas' })).toBeInTheDocument();
});

it('la matriz agrupa por tipo y el factor PESTEL viaja solo si se elige', async () => {
  const sent = serve(
    {
      'GET /v1/qms/context': () => json({ data: [STRENGTH, THREAT] }),
      'GET /v1/qms/stakeholders': () => json({ data: [CLIENTS, STAFF] }),
      'POST /v1/qms/context': () => json({ id: QMS_ID(76) }, 201),
    },
    MANAGER,
  );
  show(<QualityContext />);
  const threats = await screen.findByRole('region', { name: 'Amenaza' });
  expect(within(threats).getByText(/Alza del dólar · impacto medio/u)).toBeInTheDocument();
  const weaknesses = screen.getByRole('region', { name: 'Debilidad' });
  expect(within(weaknesses).getByText('Sin factores.')).toBeInTheDocument();
  expect(screen.getByText('Seguimiento: Encuesta trimestral')).toBeInTheDocument();
  const factor = await openDialog('Agregar factor');
  await userEvent.selectOptions(within(factor).getByLabelText('Tipo'), 'weakness');
  await userEvent.type(within(factor).getByLabelText('Descripción'), 'Pocos procesos escritos');
  await userEvent.selectOptions(within(factor).getByLabelText('Impacto'), 'low');
  await userEvent.click(within(factor).getByRole('button', { name: 'Agregar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/qms/context')?.body).toMatchObject({
      kind: 'weakness',
      pestel_factor: null,
      year: currentYear(),
    });
  });
});

it('registra una parte interesada sin seguimiento', async () => {
  const sent = serve(
    {
      'GET /v1/qms/context': () => json({ data: [] }),
      'GET /v1/qms/stakeholders': () => json({ data: [] }),
      'POST /v1/qms/stakeholders': () => json({ id: QMS_ID(77) }, 201),
    },
    MANAGER,
  );
  show(<QualityContext />);
  expect(await screen.findByText('Aún no hay partes interesadas.')).toBeInTheDocument();
  const party = await openDialog('Agregar parte interesada');
  const field = (label: string) => within(party).getByLabelText(label);
  await userEvent.type(field('Parte interesada'), 'Proveedores');
  await userEvent.selectOptions(field('Tipo'), 'external');
  await userEvent.type(field('Necesidades'), 'Pagos a tiempo');
  await userEvent.type(field('Expectativas'), 'Relación estable');
  await userEvent.click(within(party).getByRole('button', { name: 'Agregar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/qms/stakeholders')?.body).toMatchObject({
      name: 'Proveedores',
      monitoring: null,
    });
  });
});

it('las lecciones muestran su origen y quien solo lee no puede registrar', async () => {
  serve(
    {
      'GET /v1/qms/lessons': () =>
        json({ data: [LESSON, { ...LESSON, id: QMS_ID(78), process: null, nonconformity: null }] }),
    },
    ['qms.lesson.read'],
  );
  show(<QualityLessons />);
  expect(
    await screen.findByText(/SAC · Servicio al Cliente · NC-2026-0001 · Ana Prueba/u),
  ).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Registrar lección' })).not.toBeInTheDocument();
});

it('Calidad registra una lección sin proceso', async () => {
  const sent = serve(
    {
      'GET /v1/qms/lessons': () => json({ data: [] }),
      'GET /v1/qms/processes': () => json({ data: [] }),
      'POST /v1/qms/lessons': () => json({ id: QMS_ID(79) }, 201),
    },
    MANAGER,
  );
  show(<QualityLessons />);
  expect(await screen.findByText('Aún no hay lecciones registradas.')).toBeInTheDocument();
  const dialog = await openDialog('Registrar lección');
  const field = (label: string) => within(dialog).getByLabelText(label);
  await userEvent.type(field('Título'), 'Revisar antes de enviar');
  await userEvent.type(field('Qué pasó'), 'Se envió un error.');
  await userEvent.type(field('Qué aprendimos y qué haremos distinto'), 'Doble revisión.');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/qms/lessons')?.body).toMatchObject({
      process_id: null,
      nonconformity_id: null,
    });
  });
});
