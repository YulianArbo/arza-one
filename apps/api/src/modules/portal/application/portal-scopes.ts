import { hasPermission } from '../../../platform/access/ability.js';
import type { SigningRights } from '../../contract/index.js';
import type { ClientProjectScope } from '../../project/index.js';
import type { ClientServiceScope, ServiceActor } from '../../service/index.js';
import { seesAll, type PortalContext } from './portal-access.js';

// Cómo se traduce la persona del portal al alcance de cada módulo (B30, decisión 3): el
// administrador del cliente ve todo lo de su empresa; el usuario, solo lo que se le asignó y lo que
// él mismo pidió.

export function projectScope(context: PortalContext): ClientProjectScope {
  return {
    partyId: context.partyId,
    userId: context.userId,
    allProjects: seesAll(context, 'portal.project.read'),
  };
}

export function serviceScope(context: PortalContext): ClientServiceScope {
  return {
    partyId: context.partyId,
    userId: context.userId,
    name: context.name,
    email: context.email,
    allTickets: seesAll(context, 'portal.ticket.read'),
  };
}

/** Qué puede firmar desde el portal: contratos y otrosíes, y actas de entrega. */
export function signingRights(context: PortalContext): SigningRights {
  return {
    contracts: hasPermission(context.ability, 'portal.contract.sign'),
    acceptances: hasPermission(context.ability, 'portal.deliverable.decide'),
  };
}

/** Quién actúa en una escritura del portal: la persona, desde su navegador. */
export function actorOf(context: PortalContext): ServiceActor {
  return { tenantId: context.tenantId, userId: context.userId, meta: context.meta, at: context.at };
}
