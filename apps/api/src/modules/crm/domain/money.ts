import { Decimal } from 'decimal.js';

// Dinero del CRM (B22): pesos con dos decimales, sin pasar nunca por números de coma flotante. Los
// centavos se redondean al más cercano y la mitad hacia arriba, como se calcula a mano.

const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** Texto con dos decimales, como lo guarda la base: «1500000.50». */
export function moneyText(value: Decimal.Value): string {
  return new Money(value).toFixed(2);
}

/** Valor ponderado: el valor por su probabilidad. */
export function weightedValue(value: Decimal.Value, probability: number): string {
  return moneyText(new Money(value).times(probability).dividedBy(100));
}

export function sumMoney(values: readonly Decimal.Value[]): string {
  return moneyText(values.reduce<Decimal>((total, value) => total.plus(value), new Money(0)));
}

/** Porcentaje con un decimal; null si no hay base para calcularlo. */
export function percent(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return new Money(part).times(100).dividedBy(whole).toDecimalPlaces(1).toNumber();
}
