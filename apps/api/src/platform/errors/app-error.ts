/**
 * Error esperado de un caso de uso: lleva el estado HTTP, un código estable y el mensaje en
 * español para la persona (numeral 14.2). El filtro de errores lo entrega tal cual.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Segundos que la persona debe esperar; se envía en la cabecera Retry-After. */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
