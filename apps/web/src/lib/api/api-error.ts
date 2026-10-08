import { PLATFORM_ERROR_CODES } from '@arza/contracts';

// Códigos de los errores que detecta la web antes de recibir una respuesta válida de la API.
export const CLIENT_ERROR_CODES = {
  network: 'NETWORK_ERROR',
  invalidResponse: 'INVALID_RESPONSE',
} as const;

export const CLIENT_ERROR_MESSAGES = {
  network:
    'No pudimos comunicarnos con el servidor. Revise su conexión a internet e intente de nuevo.',
  invalidResponse:
    'El servidor respondió con datos inesperados. Intente de nuevo; si el problema continúa, comuníquese con soporte.',
  unexpected:
    'Ocurrió un error inesperado. Intente de nuevo; si el problema continúa, comuníquese con soporte.',
} as const;

/** Error de una petición a la API, con el formato del numeral 14.2. */
export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly code: string,
    message: string,
    /** Código HTTP; 0 si no hubo respuesta. */
    readonly status: number,
    readonly correlationId?: string,
  ) {
    super(message);
  }

  /** La sesión no existe o venció: hay que iniciar sesión de nuevo. */
  get isUnauthenticated(): boolean {
    return this.status === 401 && this.code === PLATFORM_ERROR_CODES.unauthenticated;
  }

  get isForbidden(): boolean {
    return this.code === PLATFORM_ERROR_CODES.forbidden;
  }

  /** Vale la pena reintentar: sin conexión o falla del servidor, no un error de la petición. */
  get isTransient(): boolean {
    return this.status === 0 || this.status >= 500;
  }
}
