import type { IncomingMessage, ServerResponse } from 'node:http';

import { validate as isUuid, v7 as uuidv7 } from 'uuid';

const CORRELATION_HEADER = 'x-correlation-id';

/** Reutiliza el identificador recibido si es un UUID válido; si no, genera uno nuevo (UUID v7). */
export function resolveCorrelationId(received: string | string[] | undefined): string {
  const candidate = Array.isArray(received) ? received[0] : received;
  return candidate !== undefined && isUuid(candidate) ? candidate.toLowerCase() : uuidv7();
}

/** Asigna el identificador de la petición y lo devuelve en la respuesta (numeral 13.1, paso 2). */
export function assignCorrelationId(request: IncomingMessage, response: ServerResponse): string {
  const id = resolveCorrelationId(request.headers[CORRELATION_HEADER]);
  response.setHeader(CORRELATION_HEADER, id);
  return id;
}
