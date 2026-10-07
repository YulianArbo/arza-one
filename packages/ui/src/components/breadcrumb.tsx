import { ChevronRight } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ComponentProps, JSX } from 'react';

import { cn } from '../lib/cn.js';

/** Ruta de navegación de la barra superior (16.3). */
export function Breadcrumb(props: ComponentProps<'nav'>): JSX.Element {
  return <nav aria-label="Ruta de navegación" {...props} />;
}

export function BreadcrumbList({ className, ...props }: ComponentProps<'ol'>): JSX.Element {
  return (
    <ol
      className={cn('flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export function BreadcrumbItem({ className, ...props }: ComponentProps<'li'>): JSX.Element {
  return <li className={cn('inline-flex items-center gap-1.5', className)} {...props} />;
}

export function BreadcrumbLink({
  className,
  asChild = false,
  ...props
}: ComponentProps<'a'> & { asChild?: boolean }): JSX.Element {
  const Component = asChild ? Slot.Root : 'a';
  return (
    <Component className={cn('hover:text-foreground hover:underline', className)} {...props} />
  );
}

export function BreadcrumbPage({ className, ...props }: ComponentProps<'span'>): JSX.Element {
  return (
    <span aria-current="page" className={cn('font-medium text-foreground', className)} {...props} />
  );
}

export function BreadcrumbSeparator(): JSX.Element {
  return (
    <li role="presentation" aria-hidden="true" className="[&>svg]:size-3.5">
      <ChevronRight />
    </li>
  );
}
