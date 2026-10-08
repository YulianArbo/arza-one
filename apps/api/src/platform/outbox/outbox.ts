import type { Prisma } from '../../generated/prisma/client.js';
import type { TenantTransaction } from '../database/tenant-context.js';

export interface OutboxEventInput {
  readonly tenantId: string;
  /** Nombre del numeral 13.3, por ejemplo «security.alert». */
  readonly eventType: string;
  readonly actorId: string | null;
  readonly occurredAt: Date;
  /** Datos mínimos del evento: identificadores, nunca datos personales sensibles. */
  readonly payload: Prisma.InputJsonObject;
}

/**
 * Guarda un evento de dominio en la bandeja de salida dentro de la transacción del caso de uso
 * (numeral 13.2): si la transacción se revierte, el evento no existe.
 */
export async function addOutboxEvent(
  transaction: TenantTransaction,
  event: OutboxEventInput,
): Promise<void> {
  await transaction.outboxEvent.create({ data: event });
}
