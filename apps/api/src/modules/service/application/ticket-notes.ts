import type { SvcTicketMessage } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { ServiceActor } from './service-support.js';

// Un mensaje en la conversación del tiquete (B28): lo escribe una persona o lo deja un paso del
// recorrido (escalar, reabrir, poner en espera). No se edita ni se borra.

export interface NoteKind {
  readonly internal?: boolean;
  readonly fromClient?: boolean;
}

export async function addTicketNote(
  tx: TenantTransaction,
  actor: ServiceActor,
  ticketId: string,
  body: string,
  kind: NoteKind = {},
): Promise<SvcTicketMessage> {
  return tx.svcTicketMessage.create({
    data: {
      tenantId: actor.tenantId,
      ticketId,
      authorId: actor.userId,
      body,
      isInternal: kind.internal ?? true,
      fromClient: kind.fromClient ?? false,
    },
  });
}
