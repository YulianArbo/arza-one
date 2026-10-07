import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps, JSX } from 'react';

import { cn } from '../lib/cn.js';

const alertVariants = cva(
  'relative grid w-full grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 rounded-lg border bg-card p-4 text-sm [&>svg]:mt-0.5 [&>svg]:size-4',
  {
    variants: {
      tone: {
        info: 'border-info [&>svg]:text-info',
        success: 'border-success [&>svg]:text-success',
        warning: 'border-warning [&>svg]:text-warning',
        destructive: 'border-destructive [&>svg]:text-destructive',
      },
    },
    defaultVariants: { tone: 'info' },
  },
);

export type AlertProps = ComponentProps<'div'> & VariantProps<typeof alertVariants>;

/** Mensaje destacado con icono y texto; el color nunca es la única señal (16.2). */
export function Alert({ className, tone, role = 'status', ...props }: AlertProps): JSX.Element {
  return <div role={role} className={cn(alertVariants({ tone }), className)} {...props} />;
}

export function AlertTitle({ className, ...props }: ComponentProps<'p'>): JSX.Element {
  return <p className={cn('col-start-2 font-medium', className)} {...props} />;
}

export function AlertDescription({ className, ...props }: ComponentProps<'div'>): JSX.Element {
  return <div className={cn('col-start-2 text-muted-foreground', className)} {...props} />;
}
