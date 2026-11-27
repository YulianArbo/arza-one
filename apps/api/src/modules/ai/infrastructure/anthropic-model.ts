import { z } from 'zod';

import {
  AiProviderError,
  type AiCompletion,
  type AiCompletionRequest,
  type AiModel,
} from './ai-model.js';

// Claude de Anthropic por su API de mensajes (B47, decisión 2). Sin biblioteca nueva: una sola
// petición POST a una dirección fija (sin direcciones que entregue la persona, numeral 15.5). La
// llave va en una cabecera y nunca en los registros. Si un clasificador de seguridad declina, la
// misma petición pasa a otro modelo («fallbacks»); si también declina, el uso queda «refused».

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2026-10-21';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** Respuestas cortas: una respuesta, un resumen o un borrador. */
const MAX_TOKENS = 4000;

const responseSchema = z.object({
  stop_reason: z.string().nullable(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  usage: z.object({ input_tokens: z.number().int(), output_tokens: z.number().int() }),
});

export interface AnthropicSettings {
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly fetch?: typeof fetch;
}

/** Clasificar y sacar palabras clave pide poco razonamiento; redactar y resumir, algo más. */
function effortOf(useCase: AiCompletionRequest['useCase']): 'low' | 'medium' {
  return ['keywords', 'ticket_classify', 'pqrsf_classify'].includes(useCase) ? 'low' : 'medium';
}

function bodyOf(model: string, request: AiCompletionRequest): string {
  return JSON.stringify({
    model,
    max_tokens: MAX_TOKENS,
    system: request.frame.system,
    messages: [{ role: 'user', content: request.frame.user }],
    output_config: {
      effort: effortOf(request.useCase),
      format: { type: 'json_schema', schema: request.frame.schema },
    },
    fallbacks: 'default',
  });
}

async function send(settings: AnthropicSettings, body: string): Promise<Response> {
  const doFetch = settings.fetch ?? fetch;
  try {
    return await doFetch(MESSAGES_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': API_VERSION,
        'anthropic-beta': FALLBACK_BETA,
      },
      body,
      signal: AbortSignal.timeout(settings.timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    throw new AiProviderError(timedOut ? 'no respondió a tiempo' : 'no se pudo conectar');
  }
}

export function anthropicModel(settings: AnthropicSettings): AiModel {
  return {
    provider: 'anthropic',
    model: settings.model,
    async complete(request: AiCompletionRequest): Promise<AiCompletion> {
      const response = await send(settings, bodyOf(settings.model, request));
      if (!response.ok) throw new AiProviderError(`respondió ${String(response.status)}`);
      const parsed = responseSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) throw new AiProviderError('respondió algo que no se entiende');
      const { stop_reason: stopReason, content, usage } = parsed.data;
      return {
        status: stopReason === 'refusal' ? 'refused' : 'ok',
        text: content
          .flatMap((block) => (block.type === 'text' ? [block.text ?? ''] : []))
          .join(''),
        tokensIn: usage.input_tokens,
        tokensOut: usage.output_tokens,
      };
    },
  };
}
