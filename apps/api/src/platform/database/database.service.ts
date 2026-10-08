import type { OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../generated/prisma/client.js';
import { PROBE_TIMEOUT_MS } from '../health/health-probe.js';
import {
  applyTenantContext,
  parseTenantContext,
  type TenantContext,
  type TenantTransaction,
} from './tenant-context.js';

/**
 * Conexión compartida a PostgreSQL con el usuario app_user (ADR-006 y ADR-007).
 * Toda lectura o escritura de datos de negocio pasa por withTenant: fuera de un contexto de
 * empresa la seguridad por fila no deja ver ni escribir ninguna fila.
 */
export class DatabaseService implements OnModuleDestroy {
  private readonly client: PrismaClient;

  constructor(connectionString: string) {
    const adapter = new PrismaPg({ connectionString, connectionTimeoutMillis: PROBE_TIMEOUT_MS });
    this.client = new PrismaClient({ adapter });
  }

  /** Ejecuta el trabajo en una transacción con la empresa y el usuario fijados. */
  async withTenant<T>(
    context: TenantContext,
    work: (transaction: TenantTransaction) => Promise<T>,
  ): Promise<T> {
    const validContext = parseTenantContext(context);
    return this.client.$transaction(async (transaction) => {
      await applyTenantContext(transaction, validContext);
      return work(transaction);
    });
  }

  /**
   * Transacción sin empresa: la seguridad por fila no deja ver ni escribir ninguna fila. Solo
   * sirve para las funciones de búsqueda de identidad (B08), que dicen a qué empresa pertenece
   * un correo, una sesión o un enlace antes de abrir la transacción de esa empresa.
   */
  async withoutTenant<T>(work: (transaction: TenantTransaction) => Promise<T>): Promise<T> {
    return this.client.$transaction(work);
  }

  /** Comprueba que la base de datos responde. La usa /health. */
  async ping(): Promise<void> {
    await this.client.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
