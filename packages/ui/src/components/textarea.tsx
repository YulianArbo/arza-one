import type { ComponentProps, JSX } from 'react';

import { cn } from '../lib/cn.js';

/** Texto de varias líneas. Siempre va con una etiqueta visible (Label) asociada por su id (16.6). */
export function Textarea({ className, ...props }: ComponentProps<'textarea'>): JSX.Element {
  return (
    <textarea
      className={cn(
        'flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground read-only:bg-muted disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}
