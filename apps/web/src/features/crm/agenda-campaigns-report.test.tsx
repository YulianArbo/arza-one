import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import {
  ACTIVITY_ID,
  CAMPAIGN_ID,
  COMMERCIAL,
  CRM_READER,
  LEAD_ID,
  serveCrm,
} from '../../test-support/crm-fixtures';
import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import { ActivitiesPanel } from './activities-panel';
import { ActivityAgenda } from './activity-agenda';
import { CampaignsPanel } from './campaigns-panel';
import { FunnelReportPanel } from './funnel-report';

// Agenda y actividades, campañas e informe del embudo (B22).

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

describe('agenda comercial', () => {
  it('muestra las actividades propias y marca una hecha con su resultado', async () => {
    const sent = serveCrm(COMMERCIAL, {
      [`POST /v1/crm/activities/${ACTIVITY_ID}/actions/complete`]: () => noContent(),
    });
    show(<ActivityAgenda />);
    expect(await screen.findByText('Llamar para entender la necesidad')).toBeVisible();
    expect(sent.find((r) => r.path === '/v1/crm/activities')?.search).toBe(
      '?mine=true&view=pending',
    );
    await userEvent.click(await screen.findByRole('button', { name: /Marcar hecha: Llamar/u }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Marcar hecha' }));
    expect(within(dialog).getByText('Escriba qué pasó (al menos tres letras).')).toBeVisible();
    await userEvent.type(within(dialog).getByLabelText('Resultado'), 'Pidió propuesta.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Marcar hecha' }));
    await vi.waitFor(() => {
      const done = sent.find((r) => r.path.endsWith('/actions/complete'));
      expect(done?.body).toEqual({ outcome: 'Pidió propuesta.' });
    });
  });
});

describe('actividades de un prospecto', () => {
  it('agenda una actividad con la hora de Colombia', async () => {
    const sent = serveCrm(COMMERCIAL, {
      'POST /v1/crm/activities': () => json({ id: ACTIVITY_ID }, 201),
    });
    show(<ActivitiesPanel target={{ leadId: LEAD_ID, opportunityId: null }} open />);
    await userEvent.click(await screen.findByRole('button', { name: 'Agendar actividad' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Asunto'), 'Reunión de diagnóstico');
    await userEvent.type(
      within(dialog).getByLabelText('Día y hora (hora de Colombia)'),
      '2026-10-23T10:30',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Agendar' }));
    await vi.waitFor(() => {
      const post = sent.find((r) => r.method === 'POST');
      expect(post?.body).toMatchObject({
        lead_id: LEAD_ID,
        subject: 'Reunión de diagnóstico',
        due_at: '2026-10-23T15:30:00.000Z',
      });
    });
  });

  it('sin actividades lo dice; quien solo lee no puede agendar', async () => {
    serveCrm(CRM_READER, {
      'GET /v1/crm/activities': () => json({ data: [], next_cursor: null }),
    });
    show(<ActivitiesPanel target={{ leadId: LEAD_ID, opportunityId: null }} open />);
    expect(await screen.findByText('No hay actividades')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Agendar actividad' })).toBeNull();
  });
});

describe('campañas', () => {
  it('lista las campañas y crea una nueva', async () => {
    const sent = serveCrm(COMMERCIAL, {
      'POST /v1/crm/campaigns': () => json({ id: CAMPAIGN_ID }, 201),
    });
    show(<CampaignsPanel />);
    expect(await screen.findByText('Feria tecnológica')).toBeVisible();
    await userEvent.click(await screen.findByRole('button', { name: 'Crear campaña' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Boletín de noviembre');
    await userEvent.type(within(dialog).getByLabelText('Primer día'), '2026-11-01');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'POST')?.body).toMatchObject({
        name: 'Boletín de noviembre',
        channel: 'email',
        starts_on: '2026-11-01',
        budget: null,
      });
    });
  });
});

describe('informe del embudo', () => {
  it('muestra los totales y descarga el RE-COM-001', async () => {
    const sent = serveCrm(COMMERCIAL, {
      'POST /v1/crm/reports/funnel/export': () => new Response('Código;\r\n', { status: 200 }),
    });
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }),
    );
    show(<FunnelReportPanel />);
    expect(await screen.findByText('25 %', { exact: false })).toBeVisible();
    expect(screen.getByText(/Precio \(1\)/u)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Descargar RE-COM-001 (CSV)' }));
    await vi.waitFor(() => {
      expect(sent.some((r) => r.path === '/v1/crm/reports/funnel/export')).toBe(true);
    });
  });
});
