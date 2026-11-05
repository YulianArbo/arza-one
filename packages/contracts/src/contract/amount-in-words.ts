// Valor en letras de los contratos (B24): «UN MILLÓN DOSCIENTOS MIL PESOS M/CTE.», como se escribe
// en Colombia. Trabaja sobre el texto del valor («1200000.50») para no perder centavos.

const UNITS = [
  '',
  'UN',
  'DOS',
  'TRES',
  'CUATRO',
  'CINCO',
  'SEIS',
  'SIETE',
  'OCHO',
  'NUEVE',
  'DIEZ',
  'ONCE',
  'DOCE',
  'TRECE',
  'CATORCE',
  'QUINCE',
  'DIECISÉIS',
  'DIECISIETE',
  'DIECIOCHO',
  'DIECINUEVE',
  'VEINTE',
  'VEINTIÚN',
  'VEINTIDÓS',
  'VEINTITRÉS',
  'VEINTICUATRO',
  'VEINTICINCO',
  'VEINTISÉIS',
  'VEINTISIETE',
  'VEINTIOCHO',
  'VEINTINUEVE',
] as const;

const TENS = [
  '',
  '',
  '',
  'TREINTA',
  'CUARENTA',
  'CINCUENTA',
  'SESENTA',
  'SETENTA',
  'OCHENTA',
  'NOVENTA',
];

const HUNDREDS = [
  '',
  'CIENTO',
  'DOSCIENTOS',
  'TRESCIENTOS',
  'CUATROCIENTOS',
  'QUINIENTOS',
  'SEISCIENTOS',
  'SETECIENTOS',
  'OCHOCIENTOS',
  'NOVECIENTOS',
];

/** De 0 a 99. */
function belowHundred(value: number): string {
  if (value < 30) return UNITS[value] ?? '';
  const unit = value % 10;
  const tens = TENS[Math.floor(value / 10)] ?? '';
  return unit === 0 ? tens : `${tens} Y ${UNITS[unit] ?? ''}`;
}

/** De 0 a 999. */
function belowThousand(value: number): string {
  if (value === 100) return 'CIEN';
  const rest = belowHundred(value % 100);
  const hundreds = HUNDREDS[Math.floor(value / 100)] ?? '';
  return [hundreds, rest].filter((part) => part !== '').join(' ');
}

/** De 0 a 999.999. */
function belowMillion(value: number): string {
  const thousands = Math.floor(value / 1000);
  const rest = belowThousand(value % 1000);
  if (thousands === 0) return rest;
  const head = thousands === 1 ? 'MIL' : `${belowThousand(thousands)} MIL`;
  return [head, rest].filter((part) => part !== '').join(' ');
}

/** Entero en letras; los millones se cuentan en grupos de seis cifras (millón, billón). */
function integerInWords(digits: string): string {
  const value = BigInt(digits);
  if (value === 0n) return 'CERO';
  const billions = Number(value / 1_000_000_000_000n);
  const millions = Number((value / 1_000_000n) % 1_000_000n);
  const rest = Number(value % 1_000_000n);
  const parts: string[] = [];
  if (billions > 0) parts.push(billions === 1 ? 'UN BILLÓN' : `${belowMillion(billions)} BILLONES`);
  if (millions > 0) parts.push(millions === 1 ? 'UN MILLÓN' : `${belowMillion(millions)} MILLONES`);
  if (rest > 0) parts.push(belowMillion(rest));
  return parts.join(' ');
}

/** «MILLONES DE PESOS» cuando el valor termina en millones exactos, como se dice en español. */
function pesosWord(digits: string): string {
  const value = BigInt(digits);
  if (value === 1n) return 'PESO';
  return value >= 1_000_000n && value % 1_000_000n === 0n ? 'DE PESOS' : 'PESOS';
}

/** El valor en letras: «UN MILLÓN DE PESOS M/CTE.», «DIEZ PESOS CON 50/100 M/CTE.». */
export function amountInWords(amount: string): string {
  const [whole = '0', cents = ''] = amount.trim().split('.');
  const digits = whole.replace(/^0+(?=\d)/u, '');
  const words = `${integerInWords(digits)} ${pesosWord(digits)}`;
  const centsText = cents.padEnd(2, '0').slice(0, 2);
  return centsText === '00' ? `${words} M/CTE.` : `${words} CON ${centsText}/100 M/CTE.`;
}
