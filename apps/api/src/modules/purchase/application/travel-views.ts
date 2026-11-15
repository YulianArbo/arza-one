import { TRAVEL_STATUS, travelBalance, type TravelRequest } from '@arza/contracts';

import type {
  Prisma,
  PurTravelExpense,
  PurTravelRequest,
} from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { toCalendarDate } from '../../core/index.js';
import { peopleById } from '../../iam/index.js';
import { personRef, type PersonRefs } from './purchase-support.js';

// Cómo se ve un viaje: con sus gastos, el total legalizado y el saldo frente al anticipo.

type TravelWithExpenses = PurTravelRequest & { readonly expenses: readonly PurTravelExpense[] };

export async function travelViews(
  tx: TenantTransaction,
  principal: Principal,
  where: Prisma.PurTravelRequestWhereInput,
): Promise<TravelRequest[]> {
  const travels = await tx.purTravelRequest.findMany({
    where: { ...where, deletedAt: null },
    orderBy: { code: 'desc' },
    take: 300,
    include: { expenses: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } } },
  });
  const people = await peopleById(
    tx,
    travels.map((travel) => travel.travelerId),
  );
  return travels.map((travel) => travelView(travel, people, principal));
}

function travelView(
  travel: TravelWithExpenses,
  people: PersonRefs,
  principal: Principal,
): TravelRequest {
  const advance = travel.advanceAmount.toFixed(2);
  const amounts = travel.expenses.map((expense) => expense.amount.toFixed(2));
  return {
    id: travel.id,
    code: travel.code,
    traveler: personRef(people, travel.travelerId),
    destination: travel.destination,
    purpose: travel.purpose,
    starts_on: toCalendarDate(travel.startsOn),
    ends_on: toCalendarDate(travel.endsOn),
    advance_amount: advance,
    status: TRAVEL_STATUS.find((status) => status === travel.status) ?? 'draft',
    decision_note: travel.decisionNote,
    expenses: travel.expenses.map((expense) => ({
      id: expense.id,
      concept: expense.concept,
      amount: expense.amount.toFixed(2),
      support_file_id: expense.supportFileId,
    })),
    expenses_total: travelBalance('0', amounts).replace('-', ''),
    balance: travelBalance(advance, amounts),
    mine: travel.travelerId === principal.userId,
    version: travel.version,
  };
}
