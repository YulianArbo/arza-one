import { z } from 'zod';

import { moneySchema, positiveMoneySchema, signedMoneySchema } from '../finance/money.js';
import { purchasePersonRefSchema } from './requests.js';
import { moneyToCents } from './tiers.js';

// Solicitud y legalización de viajes (B33, ficha 17.12, FT-ADM-003 y FT-ADM-004). El viajero pide
// el viaje con su anticipo, otra persona lo aprueba y, al volver, el viajero lo legaliza con sus
// gastos y soportes. El saldo dice si devuelve dinero o si se le debe.

const idSchema = z.uuid();
const dateSchema = z.iso.date();
const textSchema = (min: number, max: number) => z.string().trim().min(min).max(max);

export const TRAVEL_STATUS = ['draft', 'in_approval', 'approved', 'rejected', 'legalized'] as const;
export type TravelStatus = (typeof TRAVEL_STATUS)[number];

export const travelExpenseSchema = z.object({
  id: idSchema,
  concept: z.string(),
  amount: positiveMoneySchema,
  support_file_id: idSchema,
});

export const travelRequestSchema = z.object({
  id: idSchema,
  code: z.string(),
  traveler: purchasePersonRefSchema,
  destination: z.string(),
  purpose: z.string(),
  starts_on: dateSchema,
  ends_on: dateSchema,
  advance_amount: moneySchema,
  status: z.enum(TRAVEL_STATUS),
  decision_note: z.string().nullable(),
  expenses: z.array(travelExpenseSchema),
  expenses_total: moneySchema,
  /** Anticipo menos gastos: positivo, el viajero devuelve; negativo, se le debe. */
  balance: signedMoneySchema,
  mine: z.boolean(),
  version: z.number().int().positive(),
});

export const travelRequestListResponseSchema = z.object({ data: z.array(travelRequestSchema) });

export const saveTravelRequestSchema = z
  .strictObject({
    destination: textSchema(2, 200),
    purpose: textSchema(3, 1000),
    starts_on: dateSchema,
    ends_on: dateSchema,
    advance_amount: moneySchema,
  })
  .refine((travel) => travel.ends_on >= travel.starts_on, {
    message: 'El regreso no puede ser anterior a la salida.',
    path: ['ends_on'],
  });

export const rejectTravelSchema = z.strictObject({ reason: textSchema(3, 2000) });

export const addTravelExpenseSchema = z.strictObject({
  concept: textSchema(3, 300),
  amount: positiveMoneySchema,
  support_file_id: idSchema,
});

/** Anticipo menos gastos, en pesos con dos decimales y signo. */
export function travelBalance(advance: string, expenses: readonly string[]): string {
  const spent = expenses.reduce((sum, amount) => sum + moneyToCents(amount), 0n);
  const cents = moneyToCents(advance) - spent;
  const absolute = cents < 0n ? -cents : cents;
  const text = `${String(absolute / 100n)}.${String(absolute % 100n).padStart(2, '0')}`;
  return cents < 0n ? `-${text}` : text;
}

export type TravelExpense = z.infer<typeof travelExpenseSchema>;
export type TravelRequest = z.infer<typeof travelRequestSchema>;
export type SaveTravelRequest = z.infer<typeof saveTravelRequestSchema>;
export type AddTravelExpense = z.infer<typeof addTravelExpenseSchema>;
