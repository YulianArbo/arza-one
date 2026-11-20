// Sumas y restas exactas de dinero en la web (B22B). La API manda los valores como texto con dos
// decimales («1500000.50»); aquí se cuentan en centavos con enteros grandes, sin coma flotante,
// y solo se convierten a número al final, para mostrarlos.

const MONEY = /^(-?)(\d+)(?:\.(\d{1,2}))?$/u;

/** «1500000.5» → 150000050n. Lanza un error si el texto no es un valor de dinero. */
function toCents(value: string): bigint {
  const match = MONEY.exec(value.trim());
  if (!match) throw new Error(`Valor de dinero no válido: ${value}`);
  const [, sign = '', units = '0', decimals = ''] = match;
  const cents = BigInt(units) * 100n + BigInt(decimals.padEnd(2, '0'));
  return sign === '-' ? -cents : cents;
}

/** 150000050n → «1500000.50», el mismo formato que usa la API. */
export function fromCents(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const absolute = cents < 0n ? -cents : cents;
  const units = absolute / 100n;
  const decimals = (absolute % 100n).toString().padStart(2, '0');
  return `${sign}${units.toString()}.${decimals}`;
}

/** Suma exacta de valores de dinero. */
export function sumMoney(values: readonly string[]): bigint {
  return values.reduce((total, value) => total + toCents(value), 0n);
}

/** Porcentaje entero (0 a 100) de `part` sobre `whole`, solo para mostrar. Sin base, 0. */
export function percentOfCents(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  const percent = Number((part * 1000n) / whole) / 10;
  return Math.min(100, Math.max(0, Math.round(percent)));
}
