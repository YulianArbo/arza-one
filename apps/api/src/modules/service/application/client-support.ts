import {
  kbCategorySchema,
  pqrsfStatusSchema,
  pqrsfTypeSchema,
  ticketCategorySchema,
  ticketPrioritySchema,
  ticketStatusSchema,
  type PortalArticle,
  type PortalArticleSummary,
  type PortalPqrsf,
  type PortalPqrsfRequest,
  type PortalTicketDetail,
  type PortalTicketRequest,
  type PortalTicketSummary,
} from '@arza/contracts';

import type { Prisma, SvcKbArticle, SvcTicket } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { nextBusinessCode, toCalendarDate } from '../../core/index.js';
import { projectRefs } from '../../project/index.js';
import { filePqrsf } from './pqrsf-intake.js';
import {
  peopleNames,
  recordServiceChange,
  serviceNotFound,
  statusInvalid,
  type ServiceActor,
} from './service-support.js';
import { freshClock } from './sla-clock.js';
import { policyFor } from './sla-policies.js';
import { resumeTicket } from './ticket-flow.js';
import { resolveLinks } from './ticket-links.js';
import { addTicketNote } from './ticket-notes.js';
import { TICKET_LINKS } from './ticket-records.js';
import { ticketAudit, ticketPayload } from './tickets.js';

// Lo que el portal del cliente ve y hace en Servicio al cliente (B30, decisiones 3 y 7): sus
// tiquetes y la conversación pública (nunca las notas internas), sus PQRSF y los artículos de ayuda
// para clientes. El usuario del cliente ve solo los tiquetes que él pidió; el administrador, todos
// los de su empresa. Si el tiquete esperaba al cliente, su respuesta reanuda el reloj.

/** La persona del portal: su empresa, su cuenta y si ve todos los tiquetes de la empresa. */
export interface ClientServiceScope {
  readonly partyId: string;
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly allTickets: boolean;
}

const TICKET_SEQUENCE = 'svc.ticket';
const TICKETS = { name: 'Tiquetes de la mesa de ayuda', prefix: 'TIQ', padding: 4 } as const;
const TEAM_AUTHOR = 'Equipo de soporte';

function ticketWhere(scope: ClientServiceScope): Prisma.SvcTicketWhereInput {
  return {
    partyId: scope.partyId,
    deletedAt: null,
    ...(scope.allTickets ? {} : { requesterId: scope.userId }),
  };
}

async function summariesOf(
  tx: TenantTransaction,
  tickets: readonly SvcTicket[],
): Promise<PortalTicketSummary[]> {
  const projectIds = tickets.flatMap((ticket) =>
    ticket.projectId === null ? [] : [ticket.projectId],
  );
  const projects = await projectRefs(tx, projectIds);
  return tickets.map((ticket) => ({
    id: ticket.id,
    code: ticket.code,
    subject: ticket.subject,
    category: ticketCategorySchema.parse(ticket.category),
    priority: ticketPrioritySchema.parse(ticket.priority),
    status: ticketStatusSchema.parse(ticket.status),
    project: ticket.projectId === null ? null : (projects.get(ticket.projectId)?.name ?? null),
    requester: ticket.requesterName,
    created_at: ticket.createdAt.toISOString(),
    updated_at: ticket.updatedAt.toISOString(),
  }));
}

/** Los tiquetes que la persona ve, los más recientes primero. */
export async function clientTickets(
  tx: TenantTransaction,
  scope: ClientServiceScope,
): Promise<PortalTicketSummary[]> {
  const tickets = await tx.svcTicket.findMany({
    where: ticketWhere(scope),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 200,
  });
  return summariesOf(tx, tickets);
}

async function visibleTicket(tx: TenantTransaction, scope: ClientServiceScope, id: string) {
  const ticket = await tx.svcTicket.findFirst({
    where: { ...ticketWhere(scope), id },
    include: TICKET_LINKS,
  });
  if (ticket === null) throw serviceNotFound('El tiquete');
  return ticket;
}

/** La ficha del tiquete con la conversación pública: las notas internas nunca salen aquí. */
export async function clientTicket(
  tx: TenantTransaction,
  scope: ClientServiceScope,
  id: string,
): Promise<PortalTicketDetail> {
  const ticket = await visibleTicket(tx, scope, id);
  const messages = await tx.svcTicketMessage.findMany({
    where: { ticketId: ticket.id, isInternal: false, deletedAt: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const clientAuthors = messages.filter((message) => message.fromClient);
  const names = await peopleNames(
    tx,
    clientAuthors.map((message) => message.authorId),
  );
  const [summary] = await summariesOf(tx, [ticket]);
  if (summary === undefined) throw serviceNotFound('El tiquete');
  return {
    ...summary,
    description: ticket.description,
    resolution: ticket.resolution,
    can_reply: ticket.status !== 'closed',
    messages: messages.map((message) => ({
      id: message.id,
      author: message.fromClient
        ? (names.get(message.authorId ?? '') ?? ticket.requesterName ?? 'Cliente')
        : TEAM_AUTHOR,
      from_client: message.fromClient,
      body: message.body,
      created_at: message.createdAt.toISOString(),
    })),
  };
}

/** Registra un tiquete del portal a nombre de la persona y de su empresa. */
export async function createClientTicket(
  tx: TenantTransaction,
  actor: ServiceActor,
  scope: ClientServiceScope,
  input: PortalTicketRequest,
): Promise<string> {
  const links = await resolveLinks(
    tx,
    { party_id: scope.partyId, project_id: input.project_id, deliverable_id: null },
    actor.at,
  );
  const policy = await policyFor(tx, actor, input.priority);
  const ticket = await tx.svcTicket.create({
    data: {
      tenantId: actor.tenantId,
      code: await nextBusinessCode(tx, TICKET_SEQUENCE, actor.at, TICKETS),
      subject: input.subject,
      description: input.description,
      category: input.category,
      priority: input.priority,
      channel: 'portal',
      partyId: links.partyId,
      projectId: links.projectId,
      requesterId: scope.userId,
      requesterName: scope.name,
      requesterEmail: scope.email,
      slaPolicyId: policy.id,
      ...(await freshClock(tx, policy, actor.at)),
    },
  });
  await recordServiceChange(tx, actor, {
    action: 'service.ticket.create',
    event: 'service.ticket.created',
    entityType: 'svc_ticket',
    entityId: ticket.id,
    changes: { ...ticketAudit(ticket), in_warranty: false },
    payload: ticketPayload(ticket),
  });
  return ticket.id;
}

/** La respuesta del cliente: si el tiquete esperaba al cliente, el reloj se reanuda. */
export async function replyClientTicket(
  tx: TenantTransaction,
  actor: ServiceActor,
  scope: ClientServiceScope,
  reply: { readonly ticketId: string; readonly body: string },
): Promise<string> {
  const ticket = await visibleTicket(tx, scope, reply.ticketId);
  if (ticket.status === 'closed') {
    throw statusInvalid('El tiquete está cerrado. Registre uno nuevo si hace falta.');
  }
  const kind = { internal: false, fromClient: true };
  const message = await addTicketNote(tx, actor, ticket.id, reply.body, kind);
  if (ticket.status === 'waiting_customer') {
    await resumeTicket(tx, actor, ticket, ticket.version);
  }
  await recordServiceChange(tx, actor, {
    action: 'service.ticket.message',
    event: 'service.ticket.messaged',
    entityType: 'svc_ticket_message',
    entityId: message.id,
    changes: { ticket: ticket.code, is_internal: false, from_client: true, via: 'portal' },
    payload: {
      ticket_id: ticket.id,
      code: ticket.code,
      is_internal: false,
      from_client: true,
      assignee_id: ticket.assigneeId,
    },
  });
  return message.id;
}

/** Cuántos tiquetes abiertos tiene la persona y cuántos esperan su respuesta. */
export async function clientTicketCounts(
  tx: TenantTransaction,
  scope: ClientServiceScope,
): Promise<{ open: number; waiting: number }> {
  const where = ticketWhere(scope);
  const [open, waiting] = await Promise.all([
    tx.svcTicket.count({ where: { ...where, status: { notIn: ['resolved', 'closed'] } } }),
    tx.svcTicket.count({ where: { ...where, status: 'waiting_customer' } }),
  ]);
  return { open, waiting };
}

// PQRSF ------------------------------------------------------------------------------------------

/** Las PQRSF que la persona radicó desde el portal (o con el correo de su cuenta). */
export async function clientPqrsf(
  tx: TenantTransaction,
  scope: ClientServiceScope,
): Promise<PortalPqrsf[]> {
  const rows = await tx.svcPqrsf.findMany({
    where: { partyId: scope.partyId, requesterEmail: scope.email, deletedAt: null },
    orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
    take: 200,
  });
  return rows.map((row) => {
    const responded = row.responseSentAt !== null || row.status === 'closed';
    return {
      id: row.id,
      code: row.code,
      type: pqrsfTypeSchema.parse(row.type),
      subject: row.subject,
      status: pqrsfStatusSchema.parse(row.status),
      received_at: row.receivedAt.toISOString(),
      due_on: toCalendarDate(row.dueOn),
      responded_at: row.respondedAt?.toISOString() ?? null,
      response: responded ? row.response : null,
    };
  });
}

/** Radica una PQRSF desde el portal, con los datos de la cuenta; el acuse llega al correo. */
export async function fileClientPqrsf(
  tx: TenantTransaction,
  actor: ServiceActor,
  scope: ClientServiceScope,
  input: PortalPqrsfRequest,
): Promise<{ id: string; code: string; dueOn: string }> {
  const pqrsf = await filePqrsf(tx, actor, {
    channel: 'portal',
    type: input.type,
    name: scope.name,
    email: scope.email,
    phone: null,
    subject: input.subject,
    description: input.description,
    partyId: scope.partyId,
    privacyNoticeId: null,
  });
  return { id: pqrsf.id, code: pqrsf.code, dueOn: toCalendarDate(pqrsf.dueOn) };
}

// Artículos de ayuda --------------------------------------------------------------------------

const CLIENT_ARTICLES = { status: 'published', audience: 'client', deletedAt: null } as const;

function articleSummary(article: SvcKbArticle): PortalArticleSummary {
  return {
    id: article.id,
    title: article.title,
    summary: article.summary,
    category: kbCategorySchema.parse(article.category),
    published_at: article.publishedAt?.toISOString() ?? null,
  };
}

/** Los artículos publicados para clientes; con texto, los que lo contienen. */
export async function clientArticles(
  tx: TenantTransaction,
  q: string | undefined,
): Promise<PortalArticleSummary[]> {
  const contains = q === undefined ? null : ({ contains: q, mode: 'insensitive' } as const);
  const articles = await tx.svcKbArticle.findMany({
    where: {
      ...CLIENT_ARTICLES,
      ...(contains === null
        ? {}
        : { OR: [{ title: contains }, { summary: contains }, { body: contains }] }),
    },
    orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
    take: 100,
  });
  return articles.map(articleSummary);
}

/** Un artículo publicado para clientes; uno interno o en borrador «no existe». */
export async function clientArticle(tx: TenantTransaction, id: string): Promise<PortalArticle> {
  const article = await tx.svcKbArticle.findFirst({ where: { ...CLIENT_ARTICLES, id } });
  if (article === null) throw serviceNotFound('El artículo');
  return { ...articleSummary(article), body: article.body };
}
