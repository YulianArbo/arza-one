'use client';

import {
  dashboardDataResponseSchema,
  drilldownResponseSchema,
  type DashboardFigure,
} from '@arza/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  SimpleTable,
  TableCell,
  TableRow,
} from '@arza/ui';
import Link from 'next/link';
import { useState, type JSX } from 'react';

import { QueryState } from '../administration/query-state';
import { bogotaMoment, figureValue, useDirectionQuery } from './direction-queries';

// Tablero gerencial y tablero de cumplimiento (B46, ficha 17.17). Cada cifra dice cómo se
// calcula y lleva a los registros que la originan; sin permiso para su listado, no se muestra
// (decisión 3).

export type BoardKey = 'executive' | 'compliance';

function DrilldownTable(props: {
  readonly board: BoardKey;
  readonly figure: DashboardFigure;
}): JSX.Element {
  const path = `/v1/dashboards/${props.board}/drilldown?figure=${props.figure.key}`;
  const query = useDirectionQuery(path, drilldownResponseSchema);
  return (
    <QueryState query={query} loadingLabel="Cargando los registros">
      {(data) =>
        data.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay registros detrás de esta cifra.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <SimpleTable
              headers={data.columns.map((column) => column.label)}
              scrollLabel={`Registros de ${data.label}`}
            >
              {data.rows.map((row) => (
                <TableRow key={row.id}>
                  {data.columns.map((column) => (
                    <TableCell key={column.key}>{row.cells[column.key] ?? ''}</TableCell>
                  ))}
                </TableRow>
              ))}
            </SimpleTable>
            {data.truncated ? (
              <p className="text-xs text-muted-foreground">
                Se muestran los primeros 200; el listado completo está en el módulo.
              </p>
            ) : null}
          </div>
        )
      }
    </QueryState>
  );
}

function Drilldown(props: {
  readonly board: BoardKey;
  readonly figure: DashboardFigure;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true);
        }}
      >
        Ver registros
      </Button>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{props.figure.label}</DialogTitle>
          <DialogDescription>{props.figure.how}</DialogDescription>
        </DialogHeader>
        {open ? <DrilldownTable board={props.board} figure={props.figure} /> : null}
        <Link className="text-sm underline" href={props.figure.link}>
          Ir al listado completo
        </Link>
      </DialogContent>
    </Dialog>
  );
}

function FigureCard(props: {
  readonly board: BoardKey;
  readonly figure: DashboardFigure;
}): JSX.Element {
  const { figure } = props;
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 animate-enter">
      <h3 className="text-sm font-normal text-muted-foreground">{figure.label}</h3>
      {figure.allowed ? (
        <>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            {figure.value === null ? 'Sin datos' : figureValue(figure)}
          </p>
          {figure.detail === null ? null : (
            <p className="text-xs text-muted-foreground">{figure.detail}</p>
          )}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">¿Cómo se calcula?</summary>
            <p className="mt-1">{figure.how}</p>
          </details>
          <div>
            <Drilldown board={props.board} figure={figure} />
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No tiene permiso para ver este dato.</p>
      )}
    </section>
  );
}

/** Las tarjetas de un tablero con la hora del corte. */
export function Board({ board }: { readonly board: BoardKey }): JSX.Element {
  const query = useDirectionQuery(`/v1/dashboards/${board}/data`, dashboardDataResponseSchema);
  return (
    <QueryState query={query} loadingLabel="Calculando las cifras">
      {(data) => (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Cifras calculadas al {bogotaMoment(data.generated_at)} (hora de Colombia).
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.figures.map((figure) => (
              <FigureCard key={figure.key} board={board} figure={figure} />
            ))}
          </div>
        </div>
      )}
    </QueryState>
  );
}
