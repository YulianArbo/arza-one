'use client';

import { Label as LabelPrimitive } from 'radix-ui';
import type { ComponentProps, JSX } from 'react';

import { cn } from '../lib/cn.js';

export function Label({
  className,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root>): JSX.Element {
  return (
    <LabelPrimitive.Root
      className={cn('text-sm leading-none font-medium text-foreground', className)}
      {...props}
    />
  );
}
