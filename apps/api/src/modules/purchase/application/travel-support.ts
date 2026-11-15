import type { SaveTravelRequest } from '@arza/contracts';

import type { Prisma, PurTravelRequest } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { toCalendarDate } from '../../core/index.js';
import { recordNotFound, statusInvalid } from './purchase-messages.js';
import { dateColumn, recordPurEvent, type PurActor } from './purchase-support.js';

// Piezas de los casos de uso de viajes: buscar el viaje de quien actúa, cambiarlo con control de
// versión y dejar su rastro en la auditoría.

const ENTITY = 'pur_travel_request';

export function reuseKey(): never {
  throw idempotencyKeyReused();
}

export function sameTravel(
  prior: PurTravelRequest,
  actor: PurActor,
  input: SaveTravelRequest,
): boolean {
  return (
    prior.travelerId === actor.principal.userId &&
    prior.destination === input.destination &&
    toCalendarDate(prior.startsOn) === input.starts_on
  );
}

type TravelData = Pick<
  Prisma.PurTravelRequestUncheckedCreateInput,
  'destination' | 'purpose' | 'startsOn' | 'endsOn' | 'advanceAmount'
>;

export function travelData(input: SaveTravelRequest): TravelData {
  return {
    destination: input.destination,
    purpose: input.purpose,
    startsOn: dateColumn(input.starts_on),
    endsOn: dateColumn(input.ends_on),
    advanceAmount: input.advance_amount,
  };
}

export async function findTravel(tx: TenantTransaction, id: string): Promise<PurTravelRequest> {
  const travel = await tx.purTravelRequest.findFirst({ where: { id, deletedAt: null } });
  if (travel === null) throw recordNotFound('esa solicitud de viaje');
  return travel;
}

/** El viaje de quien actúa, en el estado que la acción exige. */
export async function ownTravel(
  tx: TenantTransaction,
  actor: PurActor,
  id: string,
  status: 'draft' | 'approved',
): Promise<PurTravelRequest> {
  const travel = await findTravel(tx, id);
  if (travel.travelerId !== actor.principal.userId) throw recordNotFound('esa solicitud de viaje');
  if (travel.status !== status) {
    throw statusInvalid(
      status === 'draft'
        ? 'El viaje ya se envió a aprobación y no se edita.'
        : 'El viaje se legaliza cuando está aprobado y aún no se ha legalizado.',
    );
  }
  return travel;
}

/** El viaje aprobado del viajero, que se legaliza desde el día de salida. */
export async function travelToLegalize(
  tx: TenantTransaction,
  actor: PurActor,
  id: string,
  today: string,
): Promise<PurTravelRequest> {
  const travel = await ownTravel(tx, actor, id, 'approved');
  if (toCalendarDate(travel.startsOn) > today) {
    throw statusInvalid('El viaje se legaliza desde el día de salida.');
  }
  return travel;
}

export async function changeTravel(
  tx: TenantTransaction,
  seen: { readonly id: string; readonly version: number; readonly status: string },
  data: Prisma.PurTravelRequestUncheckedUpdateManyInput,
): Promise<void> {
  const { count } = await tx.purTravelRequest.updateMany({
    where: { ...seen, deletedAt: null },
    data,
  });
  if (count === 0) throw versionConflict();
}

export async function recordTravel(
  tx: TenantTransaction,
  actor: PurActor,
  at: Date,
  travel: PurTravelRequest,
  action: string,
  event: string,
  changes: Prisma.InputJsonObject,
): Promise<void> {
  await recordPurEvent(tx, actor, at, {
    action: `purchase.travel.${action}`,
    event: `pur.travel.${event}`,
    entityType: ENTITY,
    entityId: travel.id,
    payload: { code: travel.code },
    changes,
  });
}
