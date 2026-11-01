import type { ComponentProps, JSX } from 'react';

import { cn } from '../lib/cn.js';

export function Card({ className, ...props }: ComponentProps<'section'>): JSX.Element {
  return (
    <section
      className={cn('rounded-xl border bg-card text-card-foreground', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>): JSX.Element {
  return <div className={cn('flex flex-col gap-1 p-4 pb-2', className)} {...props} />;
}

export function CardTitle({ className, children, ...props }: ComponentProps<'h2'>): JSX.Element {
  return (
    <h2 className={cn('text-base leading-tight font-semibold', className)} {...props}>
      {children}
    </h2>
  );
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>): JSX.Element {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>): JSX.Element {
  return <div className={cn('p-4 pt-2', className)} {...props} />;
}
