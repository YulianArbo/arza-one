import type { JSX, ReactNode } from 'react';

import { Table, TableBody, TableCaption, TableHead, TableHeader, TableRow } from './table.js';

interface SimpleTableProps {
  /** Encabezados de las columnas; uno vacío se anuncia como «Acciones» al lector de pantalla. */
  readonly headers: readonly string[];
  readonly caption?: string;
  /** Nombre de la zona que desplaza a lo ancho, para recorrerla con el teclado (ver Table). */
  readonly scrollLabel?: string;
  readonly children: ReactNode;
}

/** Tabla con encabezados de texto, para los listados de la administración (numeral 16.4). */
export function SimpleTable(props: SimpleTableProps): JSX.Element {
  const { headers, caption, children, scrollLabel } = props;
  return (
    <Table {...(scrollLabel === undefined ? {} : { scrollLabel })}>
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
