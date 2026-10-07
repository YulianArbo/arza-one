import type { ComponentProps, JSX } from 'react';

import { cn } from '../lib/cn.js';

/** Bloque gris que ocupa el lugar del contenido mientras carga (16.5). */
export function Skeleton({ className, ...props }: ComponentProps<'div'>): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)}
      {...props}
    />
  );
}
