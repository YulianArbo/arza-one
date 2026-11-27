import type { AiUseCase } from '@arza/contracts';

// Instrucción de fábrica de cada uso (B47). Calidad o el administrador pueden aprobar otra versión
// con su propio tono; las reglas de seguridad del marco (prompt-frame.ts) no se editan.

export const DEFAULT_PROMPTS: Readonly<Record<AiUseCase, string>> = {
  doc_search:
    'Responda la pregunta de la persona usando solo las fuentes. Sea breve y concreto: un párrafo ' +
    'o una lista corta. Diga en qué documento está cada dato citando su identificador.',
  doc_summary:
    'Resuma el documento para alguien que no lo ha leído: propósito, alcance, pasos o reglas ' +
    'principales y responsables. Máximo diez viñetas cortas.',
  ticket_summary:
    'Resuma la conversación del tiquete: qué pidió el cliente, qué se ha hecho, qué está pendiente ' +
    'y quién tiene el siguiente paso. Máximo seis viñetas.',
  ticket_reply:
    'Redacte un borrador de respuesta al cliente, cordial y claro, en trato de usted. No prometa ' +
    'fechas, compensaciones ni soluciones que no estén en la conversación. Deje entre corchetes lo ' +
    'que la persona debe completar.',
  ticket_classify:
    'Sugiera la categoría y la prioridad del tiquete según su asunto, descripción y conversación. ' +
    'Explique en una frase por qué.',
  pqrsf_reply:
    'Redacte un borrador de respuesta formal a la PQRSF, en trato de usted, que atienda cada punto ' +
    'planteado. No reconozca responsabilidades ni ofrezca compensaciones: deje entre corchetes lo ' +
    'que la persona responsable debe decidir.',
  pqrsf_classify:
    'Sugiera el tipo de la PQRSF (petición, queja, reclamo, sugerencia o felicitación) según su ' +
    'asunto y descripción. Explique en una frase por qué.',
};

/** Instrucción del paso previo de la búsqueda: convertir la pregunta en palabras clave. */
export const KEYWORDS_PROMPT =
  'Convierta la pregunta en entre 3 y 8 palabras clave para buscar en documentos en español: ' +
  'las palabras importantes de la pregunta y sus sinónimos o formas cercanas. Sin frases.';
