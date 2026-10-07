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
