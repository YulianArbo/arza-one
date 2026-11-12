import { z } from 'zod';

// Aprobación por montos (B33, ficha 17.12): el valor de la compra cae en un tramo y el tramo dice
// cuántas cotizaciones se exigen y si la aprueba la Dirección. Los límites son un parámetro con
// vigencia (purchase.approval_tiers), no un valor escrito en el código.

const limitSchema = z
  .string()
  .trim()
  .regex(
    /^(?=.*[1-9])\d{1,16}(\.\d{1,2})?$/u,
    'Escriba un valor mayor que cero, con hasta dos decimales.',
  );

const quoteCountSchema = z
  .number()
  .int('Escriba un número entero.')
  .min(1, 'Se exige al menos una cotización.')
  .max(10, 'El máximo es 10 cotizaciones.');

export const PURCHASE_TIERS = ['low', 'mid', 'high'] as const;
export type PurchaseTier = (typeof PURCHASE_TIERS)[number];

/** Valor en pesos como centavos enteros, para comparar sin perder exactitud. */
export function moneyToCents(amount: string): bigint {
  const [whole = '0', fraction = ''] = amount.trim().split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
}

/**
 * Topes de compra: hasta low_limit se exige quotes_low; hasta mid_limit, quotes_mid; por encima,
 * quotes_high y la aprobación de la Dirección.
 */
export const purchaseTiersSchema = z
  .strictObject({
    low_limit: limitSchema.describe('Tope del tramo bajo'),
    mid_limit: limitSchema.describe('Tope del tramo medio'),
    quotes_low: quoteCountSchema.describe('Cotizaciones del tramo bajo'),
    quotes_mid: quoteCountSchema.describe('Cotizaciones del tramo medio'),
    quotes_high: quoteCountSchema.describe('Cotizaciones del tramo alto'),
  })
  .refine((tiers) => moneyToCents(tiers.mid_limit) > moneyToCents(tiers.low_limit), {
    message: 'El tope medio debe ser mayor que el tope bajo.',
    path: ['mid_limit'],
  })
  .refine((tiers) => tiers.quotes_mid >= tiers.quotes_low, {
    message: 'El tramo medio no puede exigir menos cotizaciones que el bajo.',
    path: ['quotes_mid'],
  })
  .refine((tiers) => tiers.quotes_high >= tiers.quotes_mid, {
    message: 'El tramo alto no puede exigir menos cotizaciones que el medio.',
    path: ['quotes_high'],
  });

export type PurchaseTiers = z.infer<typeof purchaseTiersSchema>;

/** Tramo en que cae un valor. */
export function purchaseTierOf(amount: string, tiers: PurchaseTiers): PurchaseTier {
  const cents = moneyToCents(amount);
  if (cents <= moneyToCents(tiers.low_limit)) return 'low';
  return cents <= moneyToCents(tiers.mid_limit) ? 'mid' : 'high';
}

/** Cotizaciones mínimas que exige un tramo. */
export function minQuotesOf(tier: PurchaseTier, tiers: PurchaseTiers): number {
  const byTier: Record<PurchaseTier, number> = {
    low: tiers.quotes_low,
    mid: tiers.quotes_mid,
    high: tiers.quotes_high,
  };
  return byTier[tier];
}

/** Un tramo exige más que otro (para saber si una cotización obliga a aprobar de nuevo). */
export function isHigherTier(tier: PurchaseTier, than: PurchaseTier): boolean {
  return PURCHASE_TIERS.indexOf(tier) > PURCHASE_TIERS.indexOf(than);
}
