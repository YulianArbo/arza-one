import type { AiInputClass, AiSource, AiSourceKind, AiUseCase } from '@arza/contracts';

import type { FrameSource } from './prompt-frame.js';
import { redactPersonalData } from './redaction.js';

// Minimización de cada petición (B47, decisiones 5 y 8): borra los datos personales de la pregunta
// y de las fuentes y recorta lo que pase del tamaño máximo, en orden, para enviar solo lo necesario.

/** Un registro que se envía al modelo, ya leído con los permisos de la persona. */
export interface PreparedSource {
  readonly kind: AiSourceKind;
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly classification: 'public' | 'internal' | 'confidential';
  readonly body: string;
}

export interface PreparedCall {
  readonly useCase: AiUseCase;
  readonly target: { readonly kind: AiSourceKind; readonly id: string } | null;
  readonly question: string | null;
  readonly sources: readonly PreparedSource[];
  /** Fuentes que se citan siempre: el registro sobre el que se trabaja. */
  readonly alwaysCited: boolean;
}

export interface Minimized {
  readonly question: string | null;
  readonly sources: readonly (PreparedSource & { readonly ref: string })[];
  readonly redactions: number;
  readonly truncated: boolean;
  readonly chars: number;
}

export function inputClassOf(sources: readonly PreparedSource[]): AiInputClass {
  if (sources.length === 0) return 'none';
  return sources.some((source) => source.classification === 'confidential')
    ? 'confidential'
    : 'internal';
}

/** Borra los datos personales y recorta lo que pase del tamaño máximo, en orden. */
export function minimized(call: PreparedCall, maxChars: number): Minimized {
  const question = call.question === null ? null : redactPersonalData(call.question);
  let budget = maxChars - (question?.text.length ?? 0);
  let redactions = question?.count ?? 0;
  let truncated = false;
  const sources = call.sources.flatMap((source, index) => {
    if (budget <= 0) {
      truncated = true;
      return [];
    }
    const clean = redactPersonalData(source.body);
    redactions += clean.count;
    const body = clean.text.slice(0, budget);
    truncated ||= body.length < clean.text.length;
    budget -= body.length;
    return [{ ...source, body, ref: `F${String(index + 1)}` }];
  });
  const chars = maxChars - budget;
  return { question: question?.text ?? null, sources, redactions, truncated, chars };
}

export function frameSources(sources: Minimized['sources']): FrameSource[] {
  return sources.map((source) => ({
    ref: source.ref,
    label: `${source.code} · ${source.title}`,
    body: source.body,
  }));
}

/** Las fuentes citadas, una vez cada registro (la búsqueda envía varios pasajes de uno). */
export function sourceViews(sources: readonly PreparedSource[]): AiSource[] {
  const unique = new Map(sources.map((source) => [`${source.kind}:${source.id}`, source]));
  return [...unique.values()].map(({ kind, id, code, title }) => ({ kind, id, code, title }));
}
