import type { DatabaseService } from '../database.service.js';
import type { TenantTransaction } from '../tenant-context.js';
import {
  DEMO_OUTBOX_EVENTS,
  DEMO_TENANTS,
  PLATFORM_TENANT,
  type SeedOutboxEvent,
  type SeedTenant,
} from './seed-data.js';

// Los guiones escriben como app_user y dentro del contexto de cada empresa, igual que la API:
// también ellos quedan sujetos a la seguridad por fila. Crean lo que falta y no tocan lo demás.

async function ensureTenant(transaction: TenantTransaction, tenant: SeedTenant): Promise<void> {
  const existing = await transaction.tenant.findUnique({ where: { id: tenant.id } });
  if (existing === null) {
    await transaction.tenant.create({ data: tenant });
  }
}

async function ensureOutboxEvent(
  transaction: TenantTransaction,
  event: SeedOutboxEvent,
): Promise<void> {
  const existing = await transaction.outboxEvent.findUnique({ where: { id: event.id } });
  if (existing === null) {
    await transaction.outboxEvent.create({ data: event });
  }
}

function systemContext(tenantId: string): { tenantId: string; userId: null } {
  return { tenantId, userId: null };
}

/** Datos semilla de todos los ambientes. */
export async function seedPlatform(database: DatabaseService): Promise<void> {
  await database.withTenant(systemContext(PLATFORM_TENANT.id), (transaction) =>
    ensureTenant(transaction, PLATFORM_TENANT),
  );
}

/** Datos ficticios para pruebas. */
export async function seedDemo(database: DatabaseService): Promise<void> {
  for (const tenant of DEMO_TENANTS) {
    const events = DEMO_OUTBOX_EVENTS.filter((event) => event.tenantId === tenant.id);
    await database.withTenant(systemContext(tenant.id), async (transaction) => {
      await ensureTenant(transaction, tenant);
      for (const event of events) {
        await ensureOutboxEvent(transaction, event);
      }
    });
  }
}
