// Minimización (B47, ficha 17.21 y Circular Externa 002 de 2024 de la SIC): antes de enviar un
// texto al modelo se borran los datos personales que se reconocen por su forma: correos, teléfonos,
// números de documento, de cuenta o de tarjeta. Las fechas y los valores en pesos se conservan.

export interface Redacted {
  readonly text: string;
  /** Cuántos datos se borraron. */
  readonly count: number;
}

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu;

/** Corridas de dígitos con espacios, puntos, guiones o paréntesis: teléfonos y números. */
const DIGITS = /\+?\(?\d[\d .()-]{5,}\d/gu;

/** Siete dígitos o más ya identifican a una persona, una cuenta o una línea. */
const MIN_DIGITS = 7;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

function digitCount(value: string): number {
  return value.replace(/\D/gu, '').length;
}

/** Un valor en pesos ($ 1.500.000) o una fecha no es un dato personal. */
function isKept(match: string, before: string): boolean {
  if (ISO_DATE.test(match.trim())) return true;
  return /\$\s*$/u.test(before);
}

export function redactPersonalData(text: string): Redacted {
  let count = 0;
  const withoutEmails = text.replace(EMAIL, () => {
    count += 1;
    return '[correo]';
  });
  const result = withoutEmails.replace(DIGITS, (match: string, offset: number, whole: string) => {
    if (digitCount(match) < MIN_DIGITS) return match;
    if (isKept(match, whole.slice(Math.max(0, offset - 3), offset))) return match;
    count += 1;
    return '[número]';
  });
  return { text: result, count };
}
