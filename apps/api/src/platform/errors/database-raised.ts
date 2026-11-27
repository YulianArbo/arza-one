import { HttpStatus } from '@nestjs/common';
import {
  PLAN_LIMIT_KINDS,
  PLAN_LIMIT_MESSAGES,
  TENANCY_ERROR_CODES,
  type PlanLimitKind,
} from '@arza/contracts';

import { AppError } from './app-error.js';

// Errores que lanza la base de datos con un código propio (B48): «PLAN_LIMIT:<tipo>» de los
// disparadores de límites del plan y «TENANCY_…» de las funciones de la plataforma. El mensaje llega
// dentro del error del controlador de PostgreSQL; aquí se busca en él y en sus causas.

const RAISED = /\b(PLAN_LIMIT:[a-z_]+|TENANCY_[A-Z_]+)\b/;
const MAX_DEPTH = 5;

/** El código que lanzó la base de datos, o null si el error no trae ninguno. */
export function raisedByDatabase(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_DEPTH && current instanceof Error; depth += 1) {
    const match = RAISED.exec(current.message);
    if (match?.[1] !== undefined) return match[1];
    current = current.cause;
  }
  return null;
}

function isPlanLimitKind(value: string): value is PlanLimitKind {
  return (PLAN_LIMIT_KINDS as readonly string[]).includes(value);
}

/** El límite del plan que se alcanzó, como error para la persona; null si no es ese el caso. */
export function planLimitError(error: unknown): AppError | null {
  const raised = raisedByDatabase(error);
  const kind = raised?.startsWith('PLAN_LIMIT:') === true ? raised.slice('PLAN_LIMIT:'.length) : '';
  if (!isPlanLimitKind(kind)) return null;
  return new AppError(
    HttpStatus.CONFLICT,
    TENANCY_ERROR_CODES.planLimitReached,
    PLAN_LIMIT_MESSAGES[kind],
  );
}
