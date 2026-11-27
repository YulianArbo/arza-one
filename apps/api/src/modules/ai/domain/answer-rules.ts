import {
  pqrsfTypeSchema,
  ticketCategorySchema,
  ticketPrioritySchema,
  type AiSuggestion,
  type AiUseCase,
} from '@arza/contracts';
import { z } from 'zod';

// Lectura de lo que respondió el modelo (B47). Se valida contra el esquema del uso; una respuesta
// que no cumple no se muestra. Solo cuentan las citas a fuentes que de verdad se enviaron: el
// modelo no puede «citar» un registro que la persona no ve (ficha 17.21).

export interface ModelAnswer {
  readonly text: string | null;
  readonly suggestion: AiSuggestion | null;
  /** Identificadores citados (F1, F2…) que estaban entre las fuentes enviadas. */
  readonly cited: readonly string[];
}

const MAX_TEXT = 12_000;
const citations = z.array(z.string()).max(50);
const textAnswer = z.object({ text: z.string().trim().min(1).max(MAX_TEXT), citations });
const ticketClass = z.object({
  category: ticketCategorySchema,
  priority: ticketPrioritySchema,
  reason: z.string().trim().min(1).max(1000),
  citations,
});
const pqrsfClass = z.object({
  type: pqrsfTypeSchema,
  reason: z.string().trim().min(1).max(1000),
  citations,
});
const keywordsAnswer = z.object({ keywords: z.array(z.string().max(60)).max(20) });

function parsedJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function citedOf(list: readonly string[], sent: readonly string[]): string[] {
  return [...new Set(list.map((ref) => ref.trim().toUpperCase()))].filter((ref) =>
    sent.includes(ref),
  );
}

/** La respuesta del uso; null si no cumple su esquema. */
export function readAnswer(
  useCase: AiUseCase,
  raw: string,
  sent: readonly string[],
): ModelAnswer | null {
  const json = parsedJson(raw);
  if (useCase === 'ticket_classify') {
    const parsed = ticketClass.safeParse(json);
    if (!parsed.success) return null;
    const { category, priority, reason } = parsed.data;
    return {
      text: null,
      suggestion: {
        ticket_category: category,
        ticket_priority: priority,
        pqrsf_type: null,
        reason,
      },
      cited: citedOf(parsed.data.citations, sent),
    };
  }
  if (useCase === 'pqrsf_classify') {
    const parsed = pqrsfClass.safeParse(json);
    if (!parsed.success) return null;
    const { type, reason } = parsed.data;
    return {
      text: null,
      suggestion: { ticket_category: null, ticket_priority: null, pqrsf_type: type, reason },
      cited: citedOf(parsed.data.citations, sent),
    };
  }
  const parsed = textAnswer.safeParse(json);
  if (!parsed.success) return null;
  return { text: parsed.data.text, suggestion: null, cited: citedOf(parsed.data.citations, sent) };
}

/** Las palabras clave del paso previo de la búsqueda; vacío si no cumple. */
export function readKeywords(raw: string): string[] {
  const parsed = keywordsAnswer.safeParse(parsedJson(raw));
  return parsed.success ? parsed.data.keywords : [];
}
