import type { CreateTicketRequest, UpdateTicketRequest } from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, fromCalendarDate } from '../../core/index.js';
import { commercialParties } from '../../party/index.js';
import { deliverableRefs, projectRefs } from '../../project/index.js';
import { linkInvalid } from './service-support.js';

// Con qué se relaciona un tiquete (B28): el cliente de Terceros, un proyecto de ese cliente y uno de
// sus entregables. Si el entregable tiene una garantía vigente, el tiquete queda «en garantía».
// Todo se pide por el índice de cada módulo (numeral 8.3).

export interface TicketLinks {
  readonly partyId: string | null;
  readonly projectId: string | null;
  readonly deliverableId: string | null;
  readonly warrantyId: string | null;
}

type LinkInput = Pick<
  CreateTicketRequest | UpdateTicketRequest,
  'party_id' | 'project_id' | 'deliverable_id'
>;

/** El tercero existe y no está bloqueado; lo usan también las PQRSF (B29). */
export async function usableParty(tx: TenantTransaction, partyId: string): Promise<string> {
  const party = (await commercialParties(tx, [partyId])).get(partyId);
  if (party?.isUsable !== true) {
    throw linkInvalid('El cliente no existe o está bloqueado. Elíjalo de la lista de Terceros.');
  }
  return party.id;
}

/** La garantía vigente hoy del entregable, si la tiene. */
async function activeWarrantyId(
  tx: TenantTransaction,
  deliverableId: string | null,
  now: Date,
): Promise<string | null> {
  if (deliverableId === null) return null;
  const warranty = await tx.svcWarranty.findFirst({
    where: { deliverableId, deletedAt: null, endsOn: { gte: fromCalendarDate(bogotaToday(now)) } },
    select: { id: true },
  });
  return warranty?.id ?? null;
}

async function projectLinks(tx: TenantTransaction, input: LinkInput) {
  if (input.project_id === null) return { projectId: null, projectPartyId: null };
  const project = (await projectRefs(tx, [input.project_id])).get(input.project_id);
  if (project === undefined) throw linkInvalid('El proyecto no existe.');
  if (input.party_id !== null && input.party_id !== project.partyId) {
    throw linkInvalid('El proyecto es de otro cliente. Elija un proyecto de este cliente.');
  }
  return { projectId: project.id, projectPartyId: project.partyId };
}

async function deliverableLink(tx: TenantTransaction, input: LinkInput): Promise<string | null> {
  if (input.deliverable_id === null) return null;
  const deliverable = (await deliverableRefs(tx, [input.deliverable_id])).get(input.deliverable_id);
  if (deliverable?.projectId !== input.project_id) {
    throw linkInvalid('El entregable no es de ese proyecto.');
  }
  return deliverable.id;
}

/** Comprueba el cliente, el proyecto y el entregable; sin cliente, toma el del proyecto. */
export async function resolveLinks(
  tx: TenantTransaction,
  input: LinkInput,
  now: Date,
): Promise<TicketLinks> {
  const { projectId, projectPartyId } = await projectLinks(tx, input);
  const partyId = input.party_id ?? projectPartyId;
  if (partyId !== null) await usableParty(tx, partyId);
  const deliverableId = await deliverableLink(tx, input);
  return {
    partyId,
    projectId,
    deliverableId,
    warrantyId: await activeWarrantyId(tx, deliverableId, now),
  };
}
