import { describe, expect, it, vi } from 'vitest';

import { readAnswer } from '../domain/answer-rules.js';
import { frameOf, type FrameSource } from '../domain/prompt-frame.js';
import { AiProviderError, type AiCompletionRequest } from './ai-model.js';
import { anthropicModel } from './anthropic-model.js';
import { rehearsalModel } from './rehearsal-model.js';

const SOURCES: FrameSource[] = [
  { ref: 'F1', label: 'TIQ-0001', body: 'La plataforma está caída y no funciona. Es urgente.' },
];

function requestOf(useCase: AiCompletionRequest['useCase']): AiCompletionRequest {
  const frame = frameOf({ useCase, instruction: 'Tarea.', question: null, sources: SOURCES });
  return { useCase, frame, question: null, sources: SOURCES };
}

function reply(status: number, body: unknown): typeof fetch {
  return vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
}

const KEY = 'k'.repeat(40);

describe('modo de ensayo (B47)', () => {
  it('responde con el esquema de cada uso, citando las fuentes enviadas', async () => {
    const model = rehearsalModel();
    for (const useCase of ['doc_summary', 'ticket_reply', 'pqrsf_reply'] as const) {
      const answer = readAnswer(useCase, (await model.complete(requestOf(useCase))).text, ['F1']);
      expect(answer?.text).toContain('Modo de ensayo');
      expect(answer?.cited).toEqual(['F1']);
    }
    const ticket = await model.complete(requestOf('ticket_classify'));
    expect(readAnswer('ticket_classify', ticket.text, ['F1'])?.suggestion).toMatchObject({
      ticket_category: 'incident',
      ticket_priority: 'high',
    });
    const pqrsf = await model.complete(requestOf('pqrsf_classify'));
    expect(readAnswer('pqrsf_classify', pqrsf.text, ['F1'])?.suggestion?.pqrsf_type).toBe(
      'petition',
    );
  });
});

describe('adaptador de Claude (B47)', () => {
  it('envía la petición a la dirección fija con la llave en la cabecera', async () => {
    const fetchSpy = reply(200, {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"text":"Hola","citations":[]}' }],
      usage: { input_tokens: 120, output_tokens: 8 },
    });
    const model = anthropicModel({
      apiKey: KEY,
      model: 'claude-opus-5-5',
      timeoutMs: 5000,
      fetch: fetchSpy,
    });
    const completion = await model.complete(requestOf('doc_summary'));
    expect(completion).toEqual({
      status: 'ok',
      text: '{"text":"Hola","citations":[]}',
      tokensIn: 120,
      tokensOut: 8,
    });
    const [url, init] = vi.mocked(fetchSpy).mock.calls[0] ?? [];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(new Headers(init?.headers).get('x-api-key')).toBe(KEY);
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default' });
    expect(body).toHaveProperty('output_config.format.type', 'json_schema');
  });
});

describe('errores del adaptador de Claude (B47)', () => {
  it('marca la respuesta declinada', async () => {
    const fetchSpy = reply(200, {
      stop_reason: 'refusal',
      content: [],
      usage: { input_tokens: 10, output_tokens: 0 },
    });
    const model = anthropicModel({
      apiKey: KEY,
      model: 'claude-opus-5-5',
      timeoutMs: 5000,
      fetch: fetchSpy,
    });
    expect((await model.complete(requestOf('ticket_classify'))).status).toBe('refused');
  });
});

describe('fallas del proveedor de IA (B47)', () => {
  it('convierte los errores del proveedor sin mostrar su contenido', async () => {
    const failing = anthropicModel({
      apiKey: KEY,
      model: 'claude-opus-5-5',
      timeoutMs: 5000,
      fetch: reply(529, { error: { message: 'secreto' } }),
    });
    await expect(failing.complete(requestOf('doc_summary'))).rejects.toThrow(
      new AiProviderError('respondió 529'),
    );
    const garbled = anthropicModel({
      apiKey: KEY,
      model: 'claude-opus-5-5',
      timeoutMs: 5000,
      fetch: reply(200, { nada: true }),
    });
    await expect(garbled.complete(requestOf('doc_summary'))).rejects.toBeInstanceOf(
      AiProviderError,
    );
    const offline = anthropicModel({
      apiKey: KEY,
      model: 'claude-opus-5-5',
      timeoutMs: 5000,
      fetch: vi.fn(() => Promise.reject(new TypeError('fetch failed'))),
    });
    await expect(offline.complete(requestOf('doc_summary'))).rejects.toThrow('no se pudo conectar');
  });
});
