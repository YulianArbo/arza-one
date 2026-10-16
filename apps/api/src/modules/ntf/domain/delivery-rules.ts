// Reglas de entrega de los avisos (B16, ficha 17.5 y PT-GTH-001).

/** Intentos de publicar un evento o de enviar un correo antes de darlo por fallido. */
export const MAX_ATTEMPTS = 5;

const MINUTE_MS = 60 * 1000;

/** Espera antes de cada reintento: 1, 5, 15 y 60 minutos. */
const RETRY_DELAYS_MIN = [1, 5, 15, 60] as const;

/** Cuándo reintentar tras el intento número `attempts` (1, 2, …). */
export function retryAt(attempts: number, now: Date): Date {
  const index = Math.min(Math.max(attempts, 1), RETRY_DELAYS_MIN.length) - 1;
  return new Date(now.getTime() + (RETRY_DELAYS_MIN[index] ?? 60) * MINUTE_MS);
}

/**
 * Un aviso a un colaborador se difiere al inicio de la jornada salvo que sea urgente (la excepción
 * parametrizada en su plantilla). Las personas del portal no son colaboradores: se les entrega ya.
 */
export function deferredToWorkday(notice: {
  readonly urgent: boolean;
  readonly collaborator: boolean;
}): boolean {
  return notice.collaborator && !notice.urgent;
}

/** Texto corto de un comentario para el aviso: una línea, como máximo 200 caracteres. */
export function excerpt(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length <= 200 ? line : `${line.slice(0, 199)}…`;
}
