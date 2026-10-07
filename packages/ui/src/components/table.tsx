import type { ComponentProps, JSX } from 'react';

import { cn } from '../lib/cn.js';

/** Tabla de datos. El contenedor desplaza a lo ancho en pantallas pequeñas. */
export function Table({ className, ...props }: ComponentProps<'table'>): JSX.Element {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
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
