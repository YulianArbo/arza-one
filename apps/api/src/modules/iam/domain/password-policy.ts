import { passwordShapeProblem } from '@arza/contracts';

// Contraseña nueva (numeral 15.1): de 12 a 128 caracteres, sin reglas de composición forzadas y
// fuera de la lista de contraseñas filtradas.

export type PasswordProblem = 'too_short' | 'too_long' | 'breached';

export function newPasswordProblem(
  password: string,
  isLeaked: (password: string) => boolean,
): PasswordProblem | null {
  return passwordShapeProblem(password) ?? (isLeaked(password) ? 'breached' : null);
}
