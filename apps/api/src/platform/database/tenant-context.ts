import { z } from 'zod';

import type { Prisma } from '../../generated/prisma/client.js';

/** Empresa y usuario en cuyo nombre se ejecuta una transacción (numeral 13.2). */
export interface TenantContext {
  readonly tenantId: string;
  /** null en procesos del sistema sin usuario, como los datos semilla. */
  readonly userId: string | null;
}

/** Cliente de base de datos dentro de una transacción con el contexto ya fijado. */
export type TenantTransaction = Prisma.TransactionClient;

const tenantContextSchema = z.object({
  tenantId: z.uuid(),
  userId: z.uuid().nullable(),
});

/** Lanza un error si el contexto no trae identificadores válidos. */
export function parseTenantContext(context: TenantContext): TenantContext {
  const parsed = tenantContextSchema.safeParse(context);
  if (!parsed.success) {
    throw new TypeError('El contexto de empresa no es válido.');
  }
  return parsed.data;
}

/**
 * Fija app.tenant_id y app.user_id solo para la transacción en curso (equivale a SET LOCAL).
 * Las políticas de seguridad por fila leen estas variables. Los valores van como parámetros.
 */
export async function applyTenantContext(
  transaction: TenantTransaction,
  context: TenantContext,
): Promise<void> {
  await transaction.$executeRaw`SELECT set_config('app.tenant_id', ${context.tenantId}, true), set_config('app.user_id', ${context.userId ?? ''}, true)`;
}

/**
 * Escrituras que no dejan evento de auditoría. Cada una es técnica: no cambia un dato de negocio
 * ni una decisión de nadie (ficha 17.20).
 */
export type UnauditedWrite =
  /** La última actividad de la sesión (last_seen_at), que mide la inactividad. */
  'session_activity';

/**
 * Falla si la transacción escribió algo y no insertó un evento de auditoría ni de seguridad. Los
 * disparadores de aud_events y aud_security_events marcan app.audited; PostgreSQL asigna un
 * número de transacción solo cuando esta escribe.
 */
export async function assertAudited(transaction: TenantTransaction): Promise<void> {
  const [state] = await transaction.$queryRaw<{ wrote: boolean; audited: boolean }[]>`
    SELECT pg_current_xact_id_if_assigned() IS NOT NULL AS wrote,
           coalesce(current_setting('app.audited', true), '') = 'on' AS audited`;
  if (state?.wrote === true && !state.audited) {
    throw new Error('La transacción escribió sin registrar su evento de auditoría (ADR-012).');
  }
}
