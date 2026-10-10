import { v7 as uuidv7 } from 'uuid';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

// Consecutivos con bloqueo de fila (numeral 13.2). El UPDATE bloquea la fila del tipo y el año
// hasta que termina la transacción de quien pidió el número: otra petición simultánea espera y
// recibe el siguiente. Si la transacción se revierte, el número vuelve: no quedan saltos.

export interface TakenNumber {
  readonly prefix: string;
  readonly padding: number;
  readonly value: number;
}

export async function takeNextValue(
  tx: TenantTransaction,
  key: string,
  year: number,
): Promise<TakenNumber | null> {
  const rows = await tx.$queryRaw<TakenNumber[]>`
    UPDATE "core_sequences" SET "next_value" = "next_value" + 1
     WHERE "key" = ${key} AND "year" = ${year} AND "deleted_at" IS NULL
     RETURNING "prefix", "padding", "next_value" - 1 AS "value"`;
  return rows[0] ?? null;
}

/**
 * Abre el año de un tipo con el prefijo y los dígitos de su año más reciente, empezando en 1. Si
 * otra transacción lo abre a la vez, la segunda no hace nada y usa la fila de la primera.
 */
export async function openYear(tx: TenantTransaction, key: string, year: number): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "core_sequences" ("id", "tenant_id", "key", "name", "prefix", "year", "padding")
    SELECT ${uuidv7()}::uuid, "tenant_id", "key", "name", "prefix", ${year}, "padding"
      FROM "core_sequences"
     WHERE "key" = ${key} AND "deleted_at" IS NULL
     ORDER BY "year" DESC
     LIMIT 1
    ON CONFLICT ("tenant_id", "key", "year") DO NOTHING`;
}
