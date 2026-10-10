import { Table, TableBody, TableCaption, TableHead, TableHeader, TableRow } from '@arza/ui';
import type { JSX, ReactNode } from 'react';

interface SimpleTableProps {
  /** Encabezados de las columnas; uno vacío se anuncia como «Acciones» al lector de pantalla. */
  readonly headers: readonly string[];
  readonly caption?: string;
  readonly children: ReactNode;
}

/** Tabla con encabezados de texto, para los listados de la administración (numeral 16.4). */
export function SimpleTable({ headers, caption, children }: SimpleTableProps): JSX.Element {
  return (
    <Table>
      {caption === undefined ? null : <TableCaption>{caption}</TableCaption>}
      <TableHeader>
        <TableRow>
          {headers.map((header, index) => (
            <TableHead key={header === '' ? `acciones-${String(index)}` : header}>
              {header === '' ? <span className="sr-only">Acciones</span> : header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
  );
}
