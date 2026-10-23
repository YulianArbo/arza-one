import { createEvent, fireEvent, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import {
  CAMPAIGN_ID,
  COMMERCIAL,
  LEAD_ID,
  OPPORTUNITY_ID,
  leadDetail,
  serveCrm,
} from '../../test-support/crm-fixtures';
import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import { ORG_ID } from '../../test-support/party-fixtures';
import { ActivitiesPanel } from './activities-panel';
import { CampaignsPanel } from './campaigns-panel';
import { CrmScreen } from './crm-screen';
import { FunnelBoard } from './funnel-board';
import { FunnelReportPanel } from './funnel-report';
import { LeadDetailPanel } from './lead-detail';
import { LeadList } from './lead-list';
import { OpportunityForm } from './opportunity-form';

// Más casos de las pantallas del CRM (B22): formularios con problemas, filtros, edición y el
// atajo de arrastrar una tarjeta del embudo con el ratón.

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push, back: vi.fn() }),
  usePathname: () => '/app/comercial',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

function show(ui: React.ReactNode): void {
  renderWithApi(<Screen>{ui}</Screen>);
}

const ORG_SUMMARY = {
  id: ORG_ID,
  kind: 'organization',
  name: 'Comercializadora Andina S.A.S.',
  id_type: 'NIT',
  id_number: '800197268',
  check_digit: 4,
  email: null,
  phone: null,
  city: null,
  status: 'active',
  roles: ['customer'],
  version: 1,
};

const EMPTY_REPORT = {
  generated_at: '2026-10-22T15:00:00.000Z',
  stages: [],
  totals: {
    open_count: 0,
    open_value: '0.00',
    weighted_value: '0.00',
    won_count: 0,
    won_value: '0.00',
    lost_count: 0,
    lost_value: '0.00',
    win_rate: null,
    leads_count: 0,
    converted_leads: 0,
    lead_conversion_rate: null,
  },
  lost_reasons: [],
  rows: [],
};

describe('registrar una oportunidad', () => {
  it('revisa los datos, busca el cliente y abre la oportunidad nueva', async () => {
    const sent = serveCrm(COMMERCIAL, {
      'GET /v1/parties': () => json({ data: [ORG_SUMMARY], next_cursor: null }),
      'POST /v1/crm/opportunities': () => json({ id: OPPORTUNITY_ID }, 201),
    });
    show(<OpportunityForm />);
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar oportunidad' }));
    expect(screen.getByText('Busque y elija el cliente.')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Buscar el cliente en Terceros'), 'andina');
    await userEvent.selectOptions(await screen.findByLabelText('Cliente'), ORG_ID);
    await userEvent.type(screen.getByLabelText('Título'), 'Portal de clientes');
    await userEvent.type(screen.getByLabelText('Valor estimado (pesos)'), '25000000');
    await userEvent.type(screen.getByLabelText('Fecha esperada de cierre'), '2026-12-15');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar oportunidad' }));
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/app/comercial/oportunidades/${OPPORTUNITY_ID}`);
    });
    expect(sent.find((r) => r.method === 'POST')?.body).toEqual({
      party_id: ORG_ID,
      title: 'Portal de clientes',
      estimated_value: '25000000',
      expected_close: '2026-12-15',
    });
  });
});

describe('editar una campaña', () => {
  it('revisa las fechas y guarda con la versión que se vio', async () => {
    const sent = serveCrm(COMMERCIAL, {
      [`PUT /v1/crm/campaigns/${CAMPAIGN_ID}`]: () => noContent(),
    });
    show(<CampaignsPanel />);
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Feria tecnológica' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Último día (opcional)'), '2026-09-01');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(
      within(dialog).getByText('El último día no puede ser anterior al primero.'),
    ).toBeVisible();
    await userEvent.clear(within(dialog).getByLabelText('Último día (opcional)'));
    await userEvent.type(within(dialog).getByLabelText('Último día (opcional)'), '2026-10-31');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      const put = sent.find((r) => r.method === 'PUT');
      expect(put?.body).toMatchObject({ ends_on: '2026-10-31', budget: '1500000.00' });
      expect(put?.headers['If-Match']).toBe('"1"');
    });
  });
});

describe('filtros y estados vacíos', () => {
  it('el informe filtra por periodo y avisa si no hay nada', async () => {
    const sent = serveCrm(COMMERCIAL, {
      'GET /v1/crm/reports/funnel': () => json(EMPTY_REPORT),
    });
    show(<FunnelReportPanel />);
    expect(await screen.findByText('No hay oportunidades en el periodo')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Creadas desde'), '2026-10-01');
    await userEvent.type(screen.getByLabelText('Hasta'), '2026-10-31');
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    await vi.waitFor(() => {
      expect(sent.at(-1)?.search).toBe('?from=2026-10-01&to=2026-10-31');
    });
  });
});

describe('filtros y estados vacíos', () => {
  it('la lista filtrada sin resultados lo dice', async () => {
    serveCrm(COMMERCIAL, {
      'GET /v1/crm/leads': () => json({ data: [], next_cursor: null }),
    });
    show(<LeadList />);
    expect(await screen.findByText('Todavía no hay prospectos')).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'Registrar prospecto' }).length).toBeGreaterThan(0);
    await userEvent.type(screen.getByLabelText('Buscar por código, nombre o empresa'), 'zzz');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText('No hay prospectos con esos filtros')).toBeVisible();
  });
});

describe('formularios de actividad y ficha descartada', () => {
  it('agendar sin asunto ni hora muestra los problemas', async () => {
    const sent = serveCrm(COMMERCIAL);
    show(<ActivitiesPanel target={{ leadId: LEAD_ID, opportunityId: null }} open />);
    await userEvent.click(await screen.findByRole('button', { name: 'Agendar actividad' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Agendar' }));
    expect(within(dialog).getByText('Escriba al menos tres letras.')).toBeVisible();
    expect(within(dialog).getByText('Elija el día y la hora.')).toBeVisible();
    expect(sent.some((r) => r.method === 'POST')).toBe(false);
  });
});

describe('formularios de actividad y ficha descartada', () => {
  it('la ficha de un descartado muestra el motivo con su detalle', async () => {
    serveCrm(COMMERCIAL, {
      [`GET /v1/crm/leads/${LEAD_ID}`]: () =>
        json(
          leadDetail({
            status: 'discarded',
            discard_reason: { code: 'OTHER', label: 'Otro' },
            discard_note: 'No contestó',
            closed_at: '2026-10-21T15:00:00.000Z',
          }),
        ),
    });
    show(<LeadDetailPanel id={LEAD_ID} />);
    expect(await screen.findByText('Otro: No contestó')).toBeVisible();
  });
});

describe('marco y atajo del ratón', () => {
  it('el marco muestra el título y las secciones', async () => {
    serveCrm(COMMERCIAL);
    show(
      <CrmScreen anyOf={['crm.lead.read']} title="Prospectos" description="Interesados">
        <p>Contenido</p>
      </CrmScreen>,
    );
    expect(await screen.findByRole('heading', { name: 'Prospectos' })).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Secciones de Comercial' })).toBeVisible();
  });
});

describe('marco y atajo del ratón', () => {
  it('soltar una tarjeta en otra columna la mueve a esa etapa', async () => {
    const sent = serveCrm(COMMERCIAL, {
      [`POST /v1/crm/opportunities/${OPPORTUNITY_ID}/actions/move`]: () => noContent(),
    });
    show(<FunnelBoard />);
    const card = await screen.findByRole('link', { name: 'Portal de clientes' });
    const data = new Map<string, string>();
    const dataTransfer = {
      get types() {
        return [...data.keys()];
      },
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) ?? '',
      effectAllowed: 'all',
    };
    fireEvent.dragStart(card, { dataTransfer });
    const target = screen.getByRole('region', { name: /Diagnóstico/u });
    const zone = target.firstElementChild ?? target;
    const over = createEvent.dragOver(zone);
    Object.defineProperty(over, 'dataTransfer', { value: dataTransfer });
    fireEvent(zone, over);
    const drop = createEvent.drop(zone);
    Object.defineProperty(drop, 'dataTransfer', { value: dataTransfer });
    fireEvent(zone, drop);
    await vi.waitFor(() => {
      const move = sent.find((r) => r.path.endsWith('/actions/move'));
      expect(move?.body).toEqual({ stage: 'diagnosis', probability: null });
    });
  });
});
