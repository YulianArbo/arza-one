import type { PermissionCode } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { json, noContent } from '../../test-support/fake-api';
import { ANA, EXAM, EXAM_SUMMARY, PPE, SST_ID, STANDARD } from './sst-fixtures';
import { SstHealth } from './sst-health';
import { SstStandards } from './sst-standards';
import { openDialog, sentTo, serveSst, show } from './sst-test-support';

// Salud (conceptos de aptitud y elementos de protección) y estándares mínimos (B37, decisiones 4, 7
// y 12): las restricciones se leen con registro y nunca se piden sin el permiso de salud.

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/talento-y-sst/sst/salud',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const SST: readonly PermissionCode[] = [
  'sst.read',
  'sst.medical.read',
  'sst.medical.manage',
  'sst.ppe.manage',
  'sst.standards.manage',
];

const CATALOG = {
  key: 'sst_ppe_items',
  name: 'Elementos',
  description: null,
  item_count: 1,
  items: [
    {
      id: SST_ID(52),
      code: 'REPOSAPIES',
      label: 'Reposapiés',
      sort_order: 1,
      is_active: true,
      version: 1,
    },
  ],
};

const HEALTH = {
  'GET /v1/sst/medical-exams': () => json({ data: [EXAM_SUMMARY] }),
  [`POST /v1/sst/medical-exams/${EXAM.id}/read`]: () => json(EXAM),
  'POST /v1/sst/medical-exams': () => json({ id: SST_ID(50) }, 201),
  'GET /v1/sst/ppe-deliveries': () =>
    json({
      data: [PPE, { ...PPE, id: SST_ID(51), acknowledged_at: '2026-11-11T13:00:00.000Z' }],
    }),
  'GET /v1/catalogs/sst_ppe_items': () => json(CATALOG),
  'POST /v1/sst/ppe-deliveries': () => json({ id: SST_ID(53) }, 201),
};

it('lee las restricciones con registro', async () => {
  serveSst(HEALTH, SST);
  show(<SstHealth />);
  expect(await screen.findByText('Vence pronto')).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Ver las restricciones de Ana Prueba' }),
  );
  expect(await screen.findByText(/Restricciones: Evitar levantar/u)).toBeInTheDocument();
});

it('registra un concepto de ingreso sin restricciones', async () => {
  const sent = serveSst(HEALTH, SST);
  show(<SstHealth />);
  const dialog = await openDialog('Registrar concepto');
  const field = (label: string) => within(dialog).getByLabelText(label);
  await userEvent.selectOptions(field('Colaborador'), ANA.id);
  await userEvent.selectOptions(field('Tipo de evaluación'), 'entry');
  await userEvent.type(field('Fecha de la evaluación'), '2026-11-19');
  await userEvent.type(field('Institución que la hizo'), 'IPS de prueba');
  await userEvent.selectOptions(field('Concepto de aptitud'), 'fit');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/sst/medical-exams')?.body).toMatchObject({
      kind: 'entry',
      restrictions: null,
      next_due_on: null,
    });
  });
});

it('registra la entrega de un elemento y muestra si fue recibido', async () => {
  const sent = serveSst(HEALTH, SST);
  show(<SstHealth />);
  expect(await screen.findByText('Sin confirmar')).toBeInTheDocument();
  expect(screen.getByText('Recibido')).toBeInTheDocument();
  const dialog = await openDialog('Registrar entrega');
  await userEvent.selectOptions(within(dialog).getByLabelText('Colaborador'), ANA.id);
  await userEvent.selectOptions(within(dialog).getByLabelText('Elemento'), 'REPOSAPIES');
  await userEvent.type(within(dialog).getByLabelText('Fecha de entrega'), '2026-11-19');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/sst/ppe-deliveries')?.body).toMatchObject({
      item: 'REPOSAPIES',
      quantity: 1,
    });
  });
});

it('sin permiso de salud no se piden los conceptos', async () => {
  const sent = serveSst(HEALTH, ['sst.read']);
  show(<SstHealth />);
  expect(await screen.findByText('Los conceptos de aptitud solo los ve SST.')).toBeInTheDocument();
  expect(sent.some((request) => request.path === '/v1/sst/medical-exams')).toBe(false);
  expect(screen.queryByRole('button', { name: 'Registrar entrega' })).not.toBeInTheDocument();
});

it('la autoevaluación muestra el puntaje y evalúa un estándar sin versión previa', async () => {
  vi.setSystemTime(new Date('2026-11-20T15:00:00.000Z'));
  const not = { ...STANDARD, code: '1.1.2', result: 'not_met', improvement: 'Asignar', version: 2 };
  const sent = serveSst(
    {
      'GET /v1/sst/standards-assessments/2026': () =>
        json({
          year: 2026,
          score: { year: 2026, score: 8550, rating: 'acceptable', assessed: 2, total: 60 },
          data: [STANDARD, not],
        }),
      'PUT /v1/sst/standards-assessments/2026/standards/1.1.1': () => noContent(),
    },
    SST,
  );
  show(<SstStandards />);
  expect(await screen.findByText('85,50 de 100')).toBeInTheDocument();
  expect(screen.getByText('Aceptable')).toBeInTheDocument();
  expect(screen.getByText(/mejora: Asignar/u)).toBeInTheDocument();
  const [first] = await screen.findAllByRole('button', { name: 'Evaluar' });
  if (first === undefined) throw new Error('Falta el botón Evaluar');
  await userEvent.click(first);
  const dialog = await screen.findByRole('dialog');
  await userEvent.selectOptions(within(dialog).getByLabelText('Resultado'), 'meets');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
  await vi.waitFor(() => {
    const request = sentTo(sent, '/standards/1.1.1');
    expect(request?.body).toMatchObject({ result: 'meets', justification: null });
    expect(request?.headers['If-Match']).toBeUndefined();
  });
});
