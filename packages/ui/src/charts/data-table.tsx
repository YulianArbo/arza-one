import type { JSX } from 'react';

export interface ChartDataTableProps {
  readonly caption: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

/** Tabla equivalente de una gráfica (16.4): visible al abrirla y siempre legible por lectores. */
export function ChartDataTable({ caption, columns, rows }: ChartDataTableProps): JSX.Element {
  return (
    <details className="group text-sm">
      <summary className="w-fit cursor-pointer text-xs text-muted-foreground hover:text-foreground">
        Ver los datos
      </summary>
      <table className="mt-2 w-full tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-left text-muted-foreground">
            {columns.map((column) => (
              <th key={column} scope="col" className="py-1 pr-3 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join('|')} className="border-t">
              {row.map((cell, index) => (
                <td key={columns[index] ?? String(index)} className="py-1 pr-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
