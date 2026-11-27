import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiError, json, noContent } from '../../test-support/fake-api';
import { sentTo, show } from '../sst/sst-test-support';
import { AI_ID, answer, serve, status } from './assistant-fixtures';
import { AssistantHome } from './assistant-home';
import { AssistantPanel } from './assistant-panel';

// Pantalla del asistente y panel en las fichas (B47): preguntar, ver la propuesta con sus fuentes,
// decir si se usó y los estados apagado, sin uso activo, sin permiso y con error.

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/asistente',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

const QUESTION = '¿Cómo se pide un cambio en un documento?';

describe('preguntar al asistente', () => {
  it('responde con sus fuentes y registra la decisión de la persona', async () => {
    const sent = serve(
      {
        'GET /v1/ai/status': () => json(status()),
        'POST /v1/ai/search': () => json(answer()),
        [`POST /v1/ai/requests/${AI_ID(90)}/review`]: () => noContent(),
      },
      ['ai.assist.use'],
    );
    show(<AssistantHome />);
    expect(await screen.findByText(/Hoy lleva 3 de 50 usos/u)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Preguntar/u }));
    expect(await screen.findByText('Escriba una pregunta de al menos cinco letras.')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Su pregunta'), QUESTION);
    await userEvent.click(screen.getByRole('button', { name: /Preguntar/u }));
    expect(await screen.findByText(/Se solicita con el formato/u)).toBeInTheDocument();
    expect(sentTo(sent, '/v1/ai/search')?.body).toEqual({ question: QUESTION });
    const source = screen.getByRole('link', { name: /PR-SGC-001/u });
    expect(source).toHaveAttribute('href', `/app/documentos/${AI_ID(10)}`);
    expect(screen.getByText('Modo de ensayo')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Registro de usos' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /La usé/u }));
    expect(sentTo(sent, '/review')?.body).toEqual({ decision: 'accepted' });
    expect(await screen.findByRole('button', { name: /La descarto/u })).toBeDisabled();
  });
});

describe('respuestas sin propuesta del asistente', () => {
  it('sin fuentes lo dice y no ofrece decidir', async () => {
    const none = answer({ outcome: 'no_sources', text: 'No encontré la respuesta.', sources: [] });
    serve({ 'GET /v1/ai/status': () => json(status()), 'POST /v1/ai/search': () => json(none) }, [
      'ai.assist.use',
    ]);
    show(<AssistantHome />);
    await userEvent.type(await screen.findByLabelText('Su pregunta'), QUESTION);
    await userEvent.click(screen.getByRole('button', { name: /Preguntar/u }));
    expect(await screen.findByText('No encontré la respuesta.')).toBeInTheDocument();
    expect(screen.getByText('Sin fuentes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /La usé/u })).toBeNull();
  });

  it('muestra el error del límite del día', async () => {
    serve(
      {
        'GET /v1/ai/status': () => json(status()),
        'POST /v1/ai/search': () =>
          apiError(429, 'AI_DAILY_LIMIT', 'Ya usó el asistente 50 veces hoy.'),
      },
      ['ai.assist.use'],
    );
    show(<AssistantHome />);
    await userEvent.type(await screen.findByLabelText('Su pregunta'), QUESTION);
    await userEvent.click(screen.getByRole('button', { name: /Preguntar/u }));
    expect(await screen.findByText('Ya usó el asistente 50 veces hoy.')).toBeInTheDocument();
  });
});

describe('estados de la pantalla del asistente', () => {
  it('apagado o sin el uso activo lo explica, y el gobierno ve sus enlaces', async () => {
    serve({ 'GET /v1/ai/status': () => json(status({ provider: 'off', enabled_use_cases: [] })) }, [
      'ai.assist.use',
      'ai.request.read',
      'ai.use_case.manage',
    ]);
    show(<AssistantHome />);
    expect(await screen.findByText('El asistente no está disponible')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registro de usos' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Usos activos' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Instrucciones' })).toBeNull();
  });

  it('sin la pregunta activa no muestra el formulario', async () => {
    serve({ 'GET /v1/ai/status': () => json(status({ enabled_use_cases: ['doc_summary'] })) }, [
      'ai.assist.use',
    ]);
    show(<AssistantHome />);
    expect(
      await screen.findByText('Las preguntas sobre documentos no están activas'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Su pregunta')).toBeNull();
  });
});

describe('panel del asistente en una ficha', () => {
  it('ofrece solo los usos activos y muestra la clasificación sugerida', async () => {
    const suggestion = answer({
      use_case: 'ticket_classify',
      text: null,
      suggestion: {
        ticket_category: 'incident',
        ticket_priority: 'high',
        pqrsf_type: null,
        reason: 'El sistema no abre.',
      },
      sources: [{ kind: 'ticket', id: AI_ID(20), code: 'TIQ-2026-0001', title: 'No abre' }],
    });
    const sent = serve(
      { 'GET /v1/ai/status': () => json(status()), 'POST /v1/ai/assist': () => json(suggestion) },
      ['ai.assist.use'],
    );
    show(
      <AssistantPanel
        targetId={AI_ID(20)}
        useCases={['ticket_summary', 'ticket_reply', 'ticket_classify']}
      />,
    );
    expect(await screen.findByRole('button', { name: /Resumir la conversación/u })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Borrador de respuesta/u })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Sugerir clasificación/u }));
    expect(await screen.findByText('Categoría: Falla o incidente')).toBeInTheDocument();
    expect(screen.getByText('Prioridad: Alta')).toBeInTheDocument();
    expect(sentTo(sent, '/v1/ai/assist')?.body).toEqual({
      use_case: 'ticket_classify',
      target_id: AI_ID(20),
    });
    expect(screen.getByRole('link', { name: /TIQ-2026-0001/u })).toHaveAttribute(
      'href',
      `/app/servicio/tiquetes/${AI_ID(20)}`,
    );
  });
});

describe('panel del asistente oculto', () => {
  it('no aparece sin usos activos para la ficha', async () => {
    const sent = serve({ 'GET /v1/ai/status': () => json(status()) }, ['ai.assist.use']);
    show(<AssistantPanel targetId={AI_ID(21)} useCases={['pqrsf_reply']} />);
    await waitFor(() => {
      expect(sent.some((request) => request.path === '/v1/ai/status')).toBe(true);
    });
    expect(screen.queryByText('Asistente')).toBeNull();
  });

  it('no aparece sin permiso ni pide el estado', async () => {
    const sent = serve({ 'GET /v1/ai/status': () => json(status()) }, ['service.ticket.read']);
    show(<AssistantPanel targetId={AI_ID(22)} useCases={['ticket_summary']} />);
    await waitFor(() => {
      expect(sent.some((request) => request.path === '/v1/me/permissions')).toBe(true);
    });
    expect(screen.queryByText('Asistente')).toBeNull();
    expect(sent.some((request) => request.path === '/v1/ai/status')).toBe(false);
  });
});
