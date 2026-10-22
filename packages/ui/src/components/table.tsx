import type { ComponentProps, JSX } from 'react';

import { cn } from '../lib/cn.js';

interface TableProps extends ComponentProps<'table'> {
  /**
   * Nombre de la zona que desplaza a lo ancho. Con él, la zona recibe el foco para recorrerla con
   * las flechas del teclado (WCAG 2.1.1); úselo en las tablas con muchas columnas.
   */
  readonly scrollLabel?: string;
}

/** Tabla de datos. El contenedor desplaza a lo ancho en pantallas pequeñas. */
export function Table({ className, scrollLabel, ...props }: TableProps): JSX.Element {
  const region =
    scrollLabel === undefined ? {} : { role: 'region', 'aria-label': scrollLabel, tabIndex: 0 };
  return (
    <div className="relative w-full overflow-x-auto" {...region}>
      <table className={cn('w-full caption-bottom text-sm tabular-nums', className)} {...props} />
    </div>
  );
}

export function TableCaption({ className, ...props }: ComponentProps<'caption'>): JSX.Element {
  return <caption className={cn('mt-3 text-sm text-muted-foreground', className)} {...props} />;
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>): JSX.Element {
  return <thead className={cn('[&_tr]:border-b', className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>): JSX.Element {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>): JSX.Element {
  return <tr className={cn('border-b hover:bg-muted', className)} {...props} />;
}

export function TableHead({ className, ...props }: ComponentProps<'th'>): JSX.Element {
  return (
    <th
      className={cn(
        'h-10 px-3 text-left align-middle font-medium text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<'td'>): JSX.Element {
  return <td className={cn('p-3 align-middle', className)} {...props} />;
}
