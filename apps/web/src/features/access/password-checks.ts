import { PASSWORD_POLICY, passwordShapeProblem } from '@arza/contracts';

// Revisión en la web de una contraseña nueva, con la misma regla de longitud que la API. La lista
// de contraseñas filtradas solo la revisa la API.

export const NEW_PASSWORD_HINT = `Mínimo ${String(PASSWORD_POLICY.minLength)} caracteres. Una frase que usted recuerde funciona bien; no hace falta mezclar símbolos.`;

export function newPasswordError(password: string): string | null {
  switch (passwordShapeProblem(password)) {
    case 'too_short': {
      return `Escriba al menos ${String(PASSWORD_POLICY.minLength)} caracteres.`;
    }
    case 'too_long': {
      return `Use como máximo ${String(PASSWORD_POLICY.maxLength)} caracteres.`;
    }
    case null: {
      return null;
    }
  }
}

export function confirmationError(password: string, confirmation: string): string | null {
  return password === confirmation ? null : 'Las dos contraseñas no coinciden.';
}
