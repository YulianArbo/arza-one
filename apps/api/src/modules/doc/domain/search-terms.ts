// Lo que la persona escribe en la búsqueda (B21), convertido en una consulta segura: solo letras,
// números y guiones, cada palabra también como comienzo de palabra («gest» encuentra «gestión»).
// Nunca llega a la base de datos un operador de búsqueda escrito por la persona.

export interface SearchTerms {
  /** Consulta para to_tsquery: palabra:* & palabra:*; null si no quedó ninguna palabra. */
  readonly query: string | null;
  /** El texto como comienzo de un código (PR-SGC); null si no parece un código. */
  readonly codePrefix: string | null;
}

const MAX_WORDS = 10;

function wordsOf(text: string): string[] {
  return text
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}-]+/u)
    .map((word) => word.replace(/-{2,}/gu, '-').replace(/^-+|-+$/gu, ''))
    .filter((word) => word.length > 0)
    .slice(0, MAX_WORDS);
}

export function searchTerms(text: string): SearchTerms {
  const words = wordsOf(text);
  const code = text.trim().toUpperCase();
  return {
    query: words.length === 0 ? null : words.map((word) => `${word}:*`).join(' & '),
    codePrefix: /^[A-Z0-9][A-Z0-9-]{1,29}$/u.test(code) ? code : null,
  };
}

/**
 * Consulta que encuentra cualquiera de las palabras (B47): las palabras clave que el asistente de
 * IA saca de una pregunta. Pasan por el mismo filtro: solo letras, números y guiones.
 */
export function anyOfTerms(keywords: readonly string[]): string | null {
  const words = [...new Set(keywords.flatMap(wordsOf))].slice(0, MAX_WORDS * 2);
  return words.length === 0 ? null : words.map((word) => `${word}:*`).join(' | ');
}
