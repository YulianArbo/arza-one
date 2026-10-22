import type { ComponentProps, JSX } from 'react';

import { cn } from '../lib/cn.js';

/** Lista desplegable nativa con el aspecto de los campos de texto. */
export function Select({ className, ...props }: ComponentProps<'select'>): JSX.Element {
  return (
    <select
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}
