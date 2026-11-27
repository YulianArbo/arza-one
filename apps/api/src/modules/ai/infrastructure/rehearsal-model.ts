import type { AiCompletion, AiCompletionRequest, AiModel } from './ai-model.js';

// Modo de ensayo (B47, decisión 2): respuestas armadas con el mismo texto de las fuentes, sin
// inteligencia artificial y sin enviar nada fuera del servidor. Sirve para probar las pantallas,
// los permisos y el registro sin una llave ni costo. Nunca se usa en producción (env-schema.ts).

const MODEL = 'ensayo-local';
const NOTICE = 'Modo de ensayo, sin inteligencia artificial: ';

function sentencesOf(text: string, count: number): string {
  const sentences = text.replace(/\s+/gu, ' ').match(/[^.!?]+[.!?]?/gu) ?? [];
  return sentences
    .slice(0, count)
    .map((sentence) => sentence.trim())
    .join(' ');
}

function has(text: string, ...words: string[]): boolean {
  const lower = text.toLowerCase();
  return words.some((word) => lower.includes(word));
}

function ticketClass(text: string): Record<string, unknown> {
  const category = has(text, 'falla', 'error', 'no funciona', 'caído', 'caida')
    ? 'incident'
    : has(text, 'cambio', 'modificar', 'nueva función')
      ? 'change'
      : has(text, '¿', 'consulta', 'pregunta')
        ? 'question'
        : 'support';
  const priority = has(text, 'urgente', 'caído', 'bloquea', 'producción') ? 'high' : 'medium';
  return { category, priority, reason: `${NOTICE}palabras del asunto y la descripción.` };
}

function pqrsfClass(text: string): Record<string, unknown> {
  const type = has(text, 'felicit', 'agradec')
    ? 'compliment'
    : has(text, 'reclamo', 'reclam', 'cobro')
      ? 'claim'
      : has(text, 'queja', 'inconform', 'mala atención')
        ? 'complaint'
        : has(text, 'sugiero', 'sugerencia', 'propongo')
          ? 'suggestion'
          : 'petition';
  return { type, reason: `${NOTICE}palabras del asunto y la descripción.` };
}

function answerOf(request: AiCompletionRequest): Record<string, unknown> {
  const [first] = request.sources;
  const all = request.sources.map((source) => source.body).join(' ');
  const refs = request.sources.slice(0, 2).map((source) => source.ref);
  switch (request.useCase) {
    case 'keywords':
      return { keywords: (request.question ?? '').split(/\s+/u).filter((word) => word.length > 3) };
    case 'ticket_classify':
      return { ...ticketClass(all), citations: refs.slice(0, 1) };
    case 'pqrsf_classify':
      return { ...pqrsfClass(all), citations: refs.slice(0, 1) };
    case 'ticket_reply':
    case 'pqrsf_reply':
      return {
        text: `${NOTICE}Buen día. Gracias por escribirnos. Revisamos su solicitud y [complete la respuesta]. Quedamos atentos.`,
        citations: refs.slice(0, 1),
      };
    default:
      if (first === undefined) return { text: `${NOTICE}no hay fuentes.`, citations: [] };
      return {
        text: `${NOTICE}${request.sources
          .slice(0, 2)
          .map((source) => `${sentencesOf(source.body, 3)} [${source.ref}]`)
          .join('\n\n')}`,
        citations: refs,
      };
  }
}

export function rehearsalModel(): AiModel {
  return {
    provider: 'rehearsal',
    model: MODEL,
    complete(request: AiCompletionRequest): Promise<AiCompletion> {
      const text = JSON.stringify(answerOf(request));
      return Promise.resolve({
        status: 'ok',
        text,
        tokensIn: Math.ceil(request.frame.user.length / 4),
        tokensOut: Math.ceil(text.length / 4),
      });
    },
  };
}
