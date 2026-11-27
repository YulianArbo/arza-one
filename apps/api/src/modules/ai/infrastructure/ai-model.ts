import type { AiUseCase } from '@arza/contracts';

import type { Frame, FrameSource } from '../domain/prompt-frame.js';

// Adaptador intercambiable del modelo de IA (numeral 8.1 y ADR-022). La pasarela le entrega la
// petición ya armada y minimizada; el adaptador solo la envía y devuelve el texto y los tokens.

export const AI_MODEL = Symbol('AI_MODEL');

export interface AiCompletionRequest {
  readonly useCase: AiUseCase | 'keywords';
  readonly frame: Frame;
  /** Las mismas partes del marco, para el modo de ensayo, que no usa un modelo. */
  readonly question: string | null;
  readonly sources: readonly FrameSource[];
}

export interface AiCompletion {
  /** refused: el modelo declinó responder (stop_reason «refusal»). */
  readonly status: 'ok' | 'refused';
  readonly text: string;
  readonly tokensIn: number;
  readonly tokensOut: number;
}

export interface AiModel {
  readonly provider: 'rehearsal' | 'anthropic';
  readonly model: string;
  complete(request: AiCompletionRequest): Promise<AiCompletion>;
}

/** El proveedor no respondió a tiempo o respondió con error. El mensaje nunca lleva contenido. */
export class AiProviderError extends Error {
  constructor(readonly detail: string) {
    super(`El proveedor de IA falló: ${detail}`);
    this.name = 'AiProviderError';
  }
}
