import { PASSWORD_POLICY } from '@arza/contracts';
import { cn } from '@arza/ui';
import type { JSX } from 'react';

interface Level {
  readonly bars: number;
  readonly label: string;
  readonly tone: string;
}

// Cuenta caracteres como los ve la persona, igual que la API (passwordShapeProblem).
const CHARACTERS = new Intl.Segmenter('es', { granularity: 'grapheme' });

// Solo cuenta la longitud, igual que la regla de la API: una frase larga es lo más seguro.
const LEVELS: readonly Level[] = [
  { bars: 1, label: 'Muy corta', tone: 'bg-destructive' },
  { bars: 2, label: 'Aceptable', tone: 'bg-warning' },
  { bars: 3, label: 'Buena', tone: 'bg-action' },
  { bars: 4, label: 'Fuerte', tone: 'bg-success' },
];

/** Nivel de una contraseña por su longitud: corta, mínima, 4 más o 8 más que la mínima. */
function strengthOf(password: string): Level | null {
  const length = Array.from(CHARACTERS.segment(password)).length;
  if (length === 0) return null;
  const min = PASSWORD_POLICY.minLength;
  const index = length < min ? 0 : length < min + 4 ? 1 : length < min + 8 ? 2 : 3;
  return LEVELS[index] ?? null;
}

/** Medidor de seguridad de la contraseña nueva (B22A), anunciado al lector de pantalla. */
export function PasswordStrength({ password }: { readonly password: string }): JSX.Element {
  const level = strengthOf(password);
  return (
    <div className="flex flex-col gap-1.5">
      <div aria-hidden="true" className="flex gap-1">
        {[1, 2, 3, 4].map((bar) => (
          <span
            key={bar}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-300',
              level && bar <= level.bars ? level.tone : 'bg-muted',
            )}
          />
        ))}
      </div>
      <p aria-live="polite" className="text-xs text-muted-foreground">
        {level
          ? `Seguridad: ${level.label}`
          : 'Una frase larga que usted recuerde es lo más seguro.'}
      </p>
    </div>
  );
}
