import type { ComponentProps, JSX } from 'react';

import { cn } from '../lib/cn.js';

type ChoiceProps = Omit<ComponentProps<'input'>, 'type'>;

const CHOICE = 'size-4 shrink-0 accent-primary disabled:cursor-not-allowed disabled:opacity-60';

/** Casilla de verificación en el color de la marca; la etiqueta visible la acompaña. */
export function Checkbox({ className, ...props }: ChoiceProps): JSX.Element {
  return <input type="checkbox" className={cn(CHOICE, className)} {...props} />;
}

/** Opción única de un grupo en el color de la marca. */
export function Radio({ className, ...props }: ChoiceProps): JSX.Element {
  return <input type="radio" className={cn(CHOICE, className)} {...props} />;
}
