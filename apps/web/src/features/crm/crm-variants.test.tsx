import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import {
  COMMERCIAL,
  CRM_READER,
  LEAD_ID,
  OPPORTUNITY_ID,
  opportunityDetail,
  serveCrm,
} from '../../test-support/crm-fixtures';
import { json, renderWithApi } from '../../test-support/fake-api';
import { ActivityAgenda } from './activity-agenda';
import { FunnelReportPanel } from './funnel-report';
import { OpportunityDetailPanel } from './opportunity-detail';

// Variantes de las pantallas del CRM (B22): actividades de oportunidades, hechas y atrasadas,
// quien solo lee, una oportunidad ganada sin prospecto y el informe con pérdidas.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/comercial',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function show(ui: React.ReactNode): void {
  renderWithApi(<Screen>{ui}</Screen>);
}

const BASE_ACTIVITY = {
  type: 'meeting',
  notes: null,
  assignee: null,
  version: 1,
};

const ACTIVITIES = [
  {
    ...BASE_ACTIVITY,
    id: '01999a00-0000-7000-8000-0000000c0211',
    subject: 'Reunión de cierre',
    due_at: '2026-01-10T15:00:00.000Z',
    done_at: '2026-01-10T16:00:00.000Z',
    outcome: 'Aceptó la propuesta',
    record: { kind: 'opportunity', id: OPPORTUNITY_ID, code: 'OPO-2026-0001', label: 'Portal' },
  },
  {
    ...BASE_ACTIVITY,
    id: '01999a00-0000-7000-8000-0000000c0212',
    subject: 'Llamada atrasada',
    due_at: '2026-01-01T15:00:00.000Z',
    done_at: null,
    outcome: null,
    record: { kind: 'lead', id: LEAD_ID, code: 'LEA-2026-0001', label: 'Laura Gómez Ríos' },
  },
];

describe('agenda: variantes', () => {
  it('muestra hechas, atrasadas y el registro de cada una; quien solo lee no marca', async () => {
    serveCrm(CRM_READER, {
      'GET /v1/crm/activities': () => json({ data: ACTIVITIES, next_cursor: null }),
    });
    show(<ActivityAgenda />);
    expect(await screen.findByText('Hecha')).toBeVisible();
    expect(screen.getByText('Atrasada')).toBeVisible();
    expect(screen.getByText('Pendiente')).toBeVisible();
    expect(screen.getByRole('link', { name: 'OPO-2026-0001 · Portal' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Marcar hecha/u })).toBeNull();
  });
});

describe('oportunidad ganada sin prospecto de origen', () => {
  it('muestra cuándo se cerró y no ofrece acciones', async () => {
    serveCrm(COMMERCIAL, {
      [`GET /v1/crm/opportunities/${OPPORTUNITY_ID}`]: () =>
        json(
          opportunityDetail({
            stage: 'won',
            probability: 100,
            lead: null,
            closed_at: '2026-10-22T15:00:00.000Z',
          }),
        ),
    });
    show(<OpportunityDetailPanel id={OPPORTUNITY_ID} />);
    expect(await screen.findByText('Cerrada')).toBeVisible();
    expect(screen.queryByText('Viene del prospecto')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Marcar perdida' })).toBeNull();
  });
});

const LOST_ROW = {
  code: 'OPO-2026-0003',
  created_on: '2026-10-02',
  client: 'Industrias del Valle',
  title: 'Mesa de ayuda',
  stage: 'lost',
  estimated_value: '300000.10',
  probability: 0,
  weighted_value: '0.00',
  expected_close: '2026-11-01',
  owner: null,
  status: 'lost',
  lost_reason: 'Precio',
  closed_on: '2026-10-21',
};

const LOST_REPORT = {
  generated_at: '2026-10-22T15:00:00.000Z',
  stages: [],
  totals: {
    open_count: 0,
    open_value: '0.00',
    weighted_value: '0.00',
    won_count: 0,
    won_value: '0.00',
    lost_count: 1,
    lost_value: '300000.10',
    win_rate: 0,
    leads_count: 2,
    converted_leads: 1,
    lead_conversion_rate: 50,
  },
  lost_reasons: [],
  rows: [LOST_ROW],
};

describe('informe: pérdidas y descarga con periodo', () => {
  it('muestra la fila perdida con su motivo y descarga con las fechas elegidas', async () => {
    const sent = serveCrm(COMMERCIAL, {
      'GET /v1/crm/reports/funnel': () => json(LOST_REPORT),
      'POST /v1/crm/reports/funnel/export': () => new Response('x', { status: 200 }),
    });
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }),
    );
    show(<FunnelReportPanel />);
    expect(await screen.findByText('Perdida · Precio')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Creadas desde'), '2026-10-01');
    await userEvent.type(screen.getByLabelText('Hasta'), '2026-10-31');
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    await userEvent.click(screen.getByRole('button', { name: 'Descargar RE-COM-001 (CSV)' }));
    await vi.waitFor(() => {
      const download = sent.find((r) => r.path.endsWith('/funnel/export'));
      expect(download?.body).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    });
  });
});
