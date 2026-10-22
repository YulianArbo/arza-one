import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import {
  COMMERCIAL,
  CRM_READER,
  LEAD_ID,
  OPPORTUNITY_ID,
  leadDetail,
  opportunityDetail,
  serveCrm,
} from '../../test-support/crm-fixtures';
import {
  apiError,
  json,
  noContent,
  renderWithApi,
  type SentRequest,
} from '../../test-support/fake-api';
import { PERSON_ID } from '../../test-support/party-fixtures';
import { LeadDetailPanel } from './lead-detail';
import { OpportunityDetailPanel } from './opportunity-detail';

// Fichas del prospecto y de la oportunidad (B22): datos, acciones permitidas y sus formularios.

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

function renderLead(): void {
  renderWithApi(
    <Screen>
      <LeadDetailPanel id={LEAD_ID} />
    </Screen>,
  );
}

function renderOpportunity(): void {
  renderWithApi(
    <Screen>
      <OpportunityDetailPanel id={OPPORTUNITY_ID} />
    </Screen>,
  );
}

function sentTo(sent: readonly SentRequest[], suffix: string): SentRequest | undefined {
  return sent.find((request) => request.path.endsWith(suffix));
}

describe('ficha del prospecto', () => {
  it('muestra sus datos y califica con confirmación', async () => {
    const sent = serveCrm(COMMERCIAL, {
      [`POST /v1/crm/leads/${LEAD_ID}/actions/qualify`]: () => noContent(),
    });
    renderLead();
    expect(await screen.findByRole('heading', { name: 'Laura Gómez Ríos' })).toBeVisible();
    expect(screen.getByText('Necesita un portal de autogestión para sus clientes.')).toBeVisible();
    expect(screen.getByText('Sitio web')).toBeVisible();
    await userEvent.click(await screen.findByRole('button', { name: 'Calificar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, calificar' }));
    await vi.waitFor(() => {
      expect(sentTo(sent, '/actions/qualify')?.headers['If-Match']).toBe('"2"');
    });
  });

  it('descartar exige el motivo', async () => {
    const sent = serveCrm(COMMERCIAL, {
      [`POST /v1/crm/leads/${LEAD_ID}/actions/discard`]: () => noContent(),
    });
    renderLead();
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Descartar' }));
    expect(await within(dialog).findByText('Elija el motivo del descarte.')).toBeVisible();
    await userEvent.selectOptions(
      await within(dialog).findByLabelText('Motivo del descarte'),
      'NOT_TARGET',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Descartar' }));
    await vi.waitFor(() => {
      expect(sentTo(sent, '/actions/discard')?.body).toEqual({ reason: 'NOT_TARGET', note: null });
    });
  });
});

describe('ficha del prospecto: convertir', () => {
  it('revisa los datos y abre la oportunidad nueva', async () => {
    const sent = serveCrm(COMMERCIAL, {
      [`GET /v1/crm/leads/${LEAD_ID}`]: () => json(leadDetail({ status: 'qualified' })),
      [`POST /v1/crm/leads/${LEAD_ID}/actions/convert`]: () => json({ id: OPPORTUNITY_ID }, 201),
    });
    renderLead();
    await userEvent.click(await screen.findByRole('button', { name: 'Convertir en oportunidad' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Convertir' }));
    expect(within(dialog).getByText('Escriba al menos tres letras.')).toBeVisible();
    await userEvent.type(within(dialog).getByLabelText('Título de la oportunidad'), 'Portal');
    await userEvent.type(within(dialog).getByLabelText('Valor estimado (pesos)'), '12000000.50');
    await userEvent.type(within(dialog).getByLabelText('Fecha esperada de cierre'), '2026-12-01');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Convertir' }));
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/app/comercial/oportunidades/${OPPORTUNITY_ID}`);
    });
    expect(sentTo(sent, '/actions/convert')?.body).toMatchObject({ party_id: PERSON_ID });
  });

  it('un prospecto cerrado o quien solo lee no tiene acciones', async () => {
    serveCrm(CRM_READER, {
      [`GET /v1/crm/leads/${LEAD_ID}`]: () =>
        json(
          leadDetail({
            status: 'discarded',
            discard_reason: { code: 'OTHER', label: 'Otro' },
            closed_at: '2026-10-21T15:00:00.000Z',
          }),
        ),
    });
    renderLead();
    expect(await screen.findByText('Otro')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Descartar' })).toBeNull();
  });
});

describe('ficha de la oportunidad', () => {
  it('cambia de etapa y explica por qué no se pudo ganar', async () => {
    const sent = serveCrm(COMMERCIAL, {
      [`POST /v1/crm/opportunities/${OPPORTUNITY_ID}/actions/move`]: () => noContent(),
      [`POST /v1/crm/opportunities/${OPPORTUNITY_ID}/actions/win`]: () =>
        apiError(422, 'CRM_DOCUMENT_REQUIRED', 'Registre primero el documento del cliente.'),
    });
    renderOpportunity();
    expect(await screen.findByRole('heading', { name: 'Portal de clientes' })).toBeVisible();
    await userEvent.selectOptions(await screen.findByLabelText('Etapa'), 'proposal');
    await vi.waitFor(() => {
      expect(sentTo(sent, '/actions/move')?.body).toEqual({ stage: 'proposal', probability: null });
    });
    await userEvent.click(screen.getByRole('button', { name: 'Marcar ganada' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, ganada' }));
    expect(await screen.findByText('Registre primero el documento del cliente.')).toBeVisible();
  });

  it('perder exige el motivo; una cerrada no ofrece acciones', async () => {
    const sent = serveCrm(COMMERCIAL, {
      [`POST /v1/crm/opportunities/${OPPORTUNITY_ID}/actions/lose`]: () => noContent(),
    });
    renderOpportunity();
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar perdida' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(
      await within(dialog).findByLabelText('Motivo de pérdida'),
      'PRICE',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Marcar perdida' }));
    await vi.waitFor(() => {
      expect(sentTo(sent, '/actions/lose')?.body).toEqual({ reason: 'PRICE', note: null });
    });
  });
});

describe('ficha de la oportunidad cerrada', () => {
  it('muestra el motivo de pérdida y ninguna acción', async () => {
    serveCrm(COMMERCIAL, {
      [`GET /v1/crm/opportunities/${OPPORTUNITY_ID}`]: () =>
        json(
          opportunityDetail({
            stage: 'lost',
            probability: 0,
            lost_reason: { code: 'PRICE', label: 'Precio' },
            lost_note: 'Más barato',
            closed_at: '2026-10-22T15:00:00.000Z',
          }),
        ),
    });
    renderOpportunity();
    expect(await screen.findByText('Precio: Más barato')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Marcar ganada' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Agendar actividad' })).toBeNull();
  });
});
