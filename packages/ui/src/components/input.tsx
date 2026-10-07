import type { ComponentProps, JSX } from 'react';

import { cn } from '../lib/cn.js';

/** Campo de texto. Siempre va con una etiqueta visible (Label) asociada por su id (16.6). */
export function Input({
  className,
  type = 'text',
  ...props
}: ComponentProps<'input'>): JSX.Element {
  return (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm text-foreground shadow-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}
