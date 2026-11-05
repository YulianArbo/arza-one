import { Decimal } from 'decimal.js';

// Totales de una cotización (B23, ficha 17.6). Los usa la API al guardar y la web al mostrar los
// totales mientras se escribe, así los dos calculan igual. Se redondea cada línea al centavo, con la
// mitad hacia arriba, como se calcula a mano; los totales son la suma de las líneas (decisión del
// dueño, B23). Nunca pasa por números de coma flotante.

const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** Lo que pesa en el cálculo de una línea, como texto con punto decimal. */
export interface QuoteLineInput {
  readonly quantity: string;
  readonly unit_price: string;
  /** Porcentaje de descuento de la línea, de 0 a 100. */
  readonly discount_percent: string;
  /** Tarifa del impuesto en porcentaje, de 0 a 100. */
  readonly tax_rate: string;
}

export interface QuoteLineTotals {
  /** Cantidad por precio. */
  readonly subtotal: string;
  readonly discount: string;
  readonly tax: string;
  /** Subtotal menos descuento más impuesto. */
  readonly total: string;
}

export interface QuoteTaxLine {
  readonly tax_rate: string;
  /** Base gravable: subtotal menos descuento de las líneas con esa tarifa. */
  readonly base: string;
  readonly tax: string;
}

export interface QuoteTotals {
  readonly lines: readonly QuoteLineTotals[];
  readonly subtotal: string;
  readonly discount_total: string;
  readonly tax_total: string;
  readonly total: string;
  /** Impuesto por tarifa, de la mayor a la menor, para el PDF. */
  readonly taxes: readonly QuoteTaxLine[];
}

function cents(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function text(value: Decimal): string {
  return value.toFixed(2);
}

function lineOf(line: QuoteLineInput) {
  const subtotal = cents(new Money(line.quantity).times(line.unit_price));
  const discount = cents(subtotal.times(line.discount_percent).dividedBy(100));
  const base = subtotal.minus(discount);
  const tax = cents(base.times(line.tax_rate).dividedBy(100));
  return { subtotal, discount, base, tax, total: base.plus(tax) };
}

function sum(values: readonly Decimal[]): Decimal {
  return values.reduce<Decimal>((total, value) => total.plus(value), new Money(0));
}

function taxesOf(
  lines: readonly QuoteLineInput[],
  computed: readonly ReturnType<typeof lineOf>[],
): QuoteTaxLine[] {
  const byRate = new Map<string, { base: Decimal; tax: Decimal }>();
  lines.forEach((line, index) => {
    const rate = new Money(line.tax_rate).toFixed(2);
    const current = byRate.get(rate) ?? { base: new Money(0), tax: new Money(0) };
    const item = computed[index];
    if (item === undefined) return;
    byRate.set(rate, { base: current.base.plus(item.base), tax: current.tax.plus(item.tax) });
  });
  return [...byRate.entries()]
    .sort(([a], [b]) => new Money(b).comparedTo(a))
    .map(([rate, amounts]) => ({
      tax_rate: rate,
      base: text(amounts.base),
      tax: text(amounts.tax),
    }));
}

/** Totales de cada línea y de la cotización. */
export function quoteTotals(lines: readonly QuoteLineInput[]): QuoteTotals {
  const computed = lines.map(lineOf);
  return {
    lines: computed.map((line) => ({
      subtotal: text(line.subtotal),
      discount: text(line.discount),
      tax: text(line.tax),
      total: text(line.total),
    })),
    subtotal: text(sum(computed.map((line) => line.subtotal))),
    discount_total: text(sum(computed.map((line) => line.discount))),
    tax_total: text(sum(computed.map((line) => line.tax))),
    total: text(sum(computed.map((line) => line.total))),
    taxes: taxesOf(lines, computed),
  };
}

/** Mayor descuento de las líneas, para compararlo con el tope sin aprobación. */
export function largestDiscount(
  lines: readonly Pick<QuoteLineInput, 'discount_percent'>[],
): string {
  const largest = lines.reduce<Decimal>(
    (top, line) => Decimal.max(top, new Money(line.discount_percent)),
    new Money(0),
  );
  return largest.toFixed(2);
}

/** El descuento pasa el tope: la cotización necesita la aprobación de la Dirección. */
export function exceedsDiscountCap(
  lines: readonly Pick<QuoteLineInput, 'discount_percent'>[],
  capPercent: string,
): boolean {
  return new Money(largestDiscount(lines)).greaterThan(capPercent);
}
