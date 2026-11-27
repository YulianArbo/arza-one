import type { AiPrompt, AiRequestRow, AiUseCaseSetting } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiError, json, noContent } from '../../test-support/fake-api';
import { sentTo, show } from '../sst/sst-test-support';
import { AI_ID, serve } from './assistant-fixtures';
import { PromptsPage } from './assistant-prompts';
import { UsagePage } from './assistant-usage';
import { UseCasesPage } from './assistant-use-cases';

// Gobierno del asistente (B47): activar usos con la evaluación de impacto, instrucciones con
// versiones aprobadas por otra persona y el registro de usos sin textos.

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/asistente',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

const OFF: AiUseCaseSetting = {
  use_case: 'doc_search',
  enabled: false,
  assessment_reference: null,
  assessment_approved_on: null,
  changed_by: null,
  changed_at: null,
  version: 0,
};

const ON: AiUseCaseSetting = {
  ...OFF,
  use_case: 'ticket_reply',
  enabled: true,
  assessment_reference: 'EIPD-IA-001',
  assessment_approved_on: '2026-11-26',
  version: 3,
};

describe('usos activos', () => {
  it('activa con la evaluación de impacto y apaga sin pedir nada', async () => {
    const sent = serve(
      {
        'GET /v1/ai/use-cases': () => json({ data: [OFF, ON] }),
        'PUT /v1/ai/use-cases/doc_search': () => noContent(),
        'PUT /v1/ai/use-cases/ticket_reply': () => noContent(),
      },
      ['ai.use_case.manage'],
    );
    show(<UseCasesPage />);
    expect(await screen.findByText('EIPD-IA-001 (26/11/2026)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Activar' }));
    expect(
      await screen.findByText('Escriba la evaluación de impacto aprobada y su fecha.'),
    ).toBeVisible();
    await userEvent.type(screen.getByLabelText('Evaluación de impacto'), 'EIPD-IA-002');
    await userEvent.type(screen.getByLabelText('Aprobada el'), '2026-11-27');
    await userEvent.click(screen.getByRole('button', { name: 'Activar' }));
    expect(sentTo(sent, '/doc_search')?.body).toEqual({
      enabled: true,
      assessment_reference: 'EIPD-IA-002',
      assessment_approved_on: '2026-11-27',
      version: 0,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Apagar' }));
    expect(sentTo(sent, '/ticket_reply')?.body).toMatchObject({ enabled: false, version: 3 });
  });
});

function prompt(n: number, status: AiPrompt['status']): AiPrompt {
  return {
    id: AI_ID(n),
    use_case: 'doc_search',
    version: n,
    body: `Instrucción número ${String(n)} para responder.`,
    status,
    created_by: { id: AI_ID(1), name: 'Paula' },
    created_at: '2026-11-26T15:00:00.000Z',
    approved_by: status === 'draft' ? null : { id: AI_ID(2), name: 'Luis' },
    approved_at: status === 'draft' ? null : '2026-11-26T16:00:00.000Z',
  };
}

describe('instrucciones', () => {
  it('guarda un borrador y lo aprueba; si es propio, muestra el motivo', async () => {
    const sent = serve(
      {
        'GET /v1/ai/prompts': () =>
          json({
            data: [prompt(2, 'draft'), prompt(1, 'approved')],
            defaults: [{ use_case: 'doc_search', body: 'Responda la pregunta.' }],
          }),
        'POST /v1/ai/prompts': () => json({ id: AI_ID(3) }, 201),
        [`POST /v1/ai/prompts/${AI_ID(2)}/approve`]: () =>
          apiError(403, 'AI_SELF_APPROVAL', 'Una instrucción la aprueba otra persona.'),
      },
      ['ai.prompt.manage'],
    );
    show(<PromptsPage />);
    const card = (await screen.findByText('Rige la versión aprobada.')).closest('div');
    expect(card).not.toBeNull();
    expect(screen.getByText('De fábrica: Responda la pregunta.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Guardar borrador/u }));
    expect(await screen.findByText(/al menos 20 caracteres/u)).toBeVisible();
    await userEvent.type(
      screen.getByLabelText('Instrucción'),
      'Responda con viñetas y cite el código.',
    );
    await userEvent.click(screen.getByRole('button', { name: /Guardar borrador/u }));
    expect(sentTo(sent, '/v1/ai/prompts')?.body).toEqual({
      use_case: 'doc_search',
      body: 'Responda con viñetas y cite el código.',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    expect(await screen.findByText('Una instrucción la aprueba otra persona.')).toBeVisible();
  });
});

const ROW: AiRequestRow = {
  id: AI_ID(40),
  created_at: '2026-11-26T15:30:00.000Z',
  user: { id: AI_ID(41), name: 'Ana Pérez' },
  use_case: 'doc_search',
  provider: 'rehearsal',
  model: 'ensayo-local',
  prompt_version: 0,
  input_class: 'internal',
  input_chars: 1200,
  output_chars: 300,
  tokens_in: 300,
  tokens_out: 75,
  redactions: 2,
  outcome: 'answered',
  target: null,
  sources: [{ kind: 'document', id: AI_ID(10) }],
  review: 'accepted',
  reviewed_at: '2026-11-26T15:31:00.000Z',
};

describe('registro de usos', () => {
  it('lista los usos y filtra por uso y resultado', async () => {
    const sent = serve(
      {
        'GET /v1/ai/requests': (request) =>
          json({ data: request.search === '' ? [ROW] : [], next_cursor: null }),
      },
      ['ai.request.read'],
    );
    show(<UsagePage />);
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Ana Pérez')).toBeInTheDocument();
    expect(within(table).getByText(/2 datos borrados/u)).toBeInTheDocument();
    expect(within(table).getByText('La usó')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Resultado'), 'blocked');
    expect(await screen.findByText('Sin usos registrados')).toBeInTheDocument();
    expect(sent.some((request) => request.search === '?outcome=blocked')).toBe(true);
  });
});
