import { Prisma } from '../../../generated/prisma/client.js';

// Piezas comunes de los registros del núcleo.

/** Registro y versión que la persona vio (cabecera If-Match). */
export interface Versioned {
  readonly id: string;
  readonly version: number;
}

/** Choque con un índice único, como un código repetido que llegó a la vez desde dos pantallas. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
