import type { AppAbility } from '../../../platform/access/ability.js';
import { hasPermission, hasUnconditionalPermission } from '../../../platform/access/ability.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { findPqrsf } from './pqrsf-records.js';
import { findVisibleTicket } from './ticket-records.js';
import { serviceNotFound } from './service-support.js';

// Lo que el asistente de IA (B47) puede leer de Servicio: lo mismo que la persona ve en la ficha
// del tiquete o de la PQRSF, con las mismas reglas. El asistente nunca lee las tablas svc_.

interface AssistantTicketMessage {
  readonly fromClient: boolean;
  readonly internal: boolean;
  readonly body: string;
}

export interface AssistantTicket {
  readonly id: string;
  readonly code: string;
  readonly subject: string;
  readonly description: string;
  readonly category: string;
  readonly priority: string;
  readonly messages: readonly AssistantTicketMessage[];
}

export interface AssistantPqrsf {
  readonly id: string;
  readonly code: string;
  readonly type: string;
  /** Si trata de datos personales (Ley 1581): el asistente no la recibe (B47, decisión 9). */
  readonly privacyKind: string | null;
  readonly subject: string;
  readonly description: string;
}

/** Cuántos mensajes de la conversación se leen, los más recientes. */
const MESSAGES = 60;

/** El tiquete y su conversación, como la ve la persona; si no lo ve, «no existe». */
export async function ticketForAssistant(
  tx: TenantTransaction,
  ability: AppAbility,
  id: string,
): Promise<AssistantTicket> {
  const ticket = await findVisibleTicket(tx, ability, id);
  const seesInternal = hasUnconditionalPermission(ability, 'service.ticket.read');
  const messages = await tx.svcTicketMessage.findMany({
    where: { ticketId: id, deletedAt: null, ...(seesInternal ? {} : { isInternal: false }) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: MESSAGES,
    select: { fromClient: true, isInternal: true, body: true },
  });
  return {
    id: ticket.id,
    code: ticket.code,
    subject: ticket.subject,
    description: ticket.description,
    category: ticket.category,
    priority: ticket.priority,
    messages: messages.reverse().map((message) => ({
      fromClient: message.fromClient,
      internal: message.isInternal,
      body: message.body,
    })),
  };
}

/** La PQRSF, si la persona puede ver las PQRSF; si no, «no existe». */
export async function pqrsfForAssistant(
  tx: TenantTransaction,
  ability: AppAbility,
  id: string,
): Promise<AssistantPqrsf> {
  if (!hasPermission(ability, 'service.pqrsf.read')) throw serviceNotFound('La PQRSF');
  const pqrsf = await findPqrsf(tx, id);
  return {
    id: pqrsf.id,
    code: pqrsf.code,
    type: pqrsf.type,
    privacyKind: pqrsf.privacyKind,
    subject: pqrsf.subject,
    description: pqrsf.description,
  };
}
