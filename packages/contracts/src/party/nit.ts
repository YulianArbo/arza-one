// Dígito de verificación del NIT (ficha 17.3): módulo 11 con los pesos primos que publica la DIAN,
// del dígito de la derecha hacia la izquierda.

const WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71] as const;

/** NIT sin dígito de verificación: solo números, de 5 a 15. */
export const NIT_NUMBER_PATTERN = /^\d{5,15}$/;

/** Dígito de verificación de un NIT. Lanza un error si el número no tiene formato de NIT. */
export function nitCheckDigit(nit: string): number {
  if (!NIT_NUMBER_PATTERN.test(nit)) throw new Error('El NIT debe tener de 5 a 15 números.');
  const digits = Array.from(nit, Number).reverse();
  const sum = digits.reduce((total, digit, index) => total + digit * (WEIGHTS[index] ?? 0), 0);
  const remainder = sum % 11;
  return remainder > 1 ? 11 - remainder : remainder;
}

/** El NIT y su dígito de verificación coinciden. */
export function isValidNit(nit: string, checkDigit: number): boolean {
  return NIT_NUMBER_PATTERN.test(nit) && nitCheckDigit(nit) === checkDigit;
}
