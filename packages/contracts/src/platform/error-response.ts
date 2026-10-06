import { z } from 'zod';

// Códigos estables de los errores transversales de la plataforma (numeral 14.2).
export const PLATFORM_ERROR_CODES = {
  badRequest: 'BAD_REQUEST',
  unauthenticated: 'UNAUTHENTICATED',
  forbidden: 'FORBIDDEN',
  notFound: 'NOT_FOUND',
  conflict: 'CONFLICT',
  validationFailed: 'VALIDATION_FAILED',
  rateLimited: 'RATE_LIMITED',
  internalError: 'INTERNAL_ERROR',
} as const;

export const errorDetailSchema = z.object({
  field: z.string().describe('Campo con el problema, en notación de puntos'),
  issue: z.string().describe('Código del problema, por ejemplo too_small o invalid_type'),
});

// Formato único de error de la API (numeral 14.2 del manual).
export const errorResponseSchema = z
  .object({
    error: z.object({
      code: z.string().describe('Código estable del error, por ejemplo QUOTE_EXPIRED'),
      message: z.string().describe('Mensaje para la persona, en español'),
      details: z.array(errorDetailSchema),
      correlation_id: z.string().describe('Identificador de la petición en los registros'),
    }),
  })
  .meta({ id: 'ErrorResponse' });

export type ErrorDetail = z.infer<typeof errorDetailSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
