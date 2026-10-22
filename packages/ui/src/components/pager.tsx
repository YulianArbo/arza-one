'use client';

import { useState, type JSX } from 'react';

import { Button } from './button.js';

interface PagerProps {
  readonly page: { readonly next_cursor: string | null };
  readonly hasPrevious: boolean;
  readonly onPrevious: () => void;
  readonly onNext: (cursor: string) => void;
  /** Página que se está viendo, empezando en 1. */
  readonly pageNumber?: number;
}

/** Página actual y botones de anterior y siguiente de un listado por cursor (numeral 14.1). */
export function Pager({
  page,
  hasPrevious,
  onPrevious,
  onNext,
  pageNumber,
}: PagerProps): JSX.Element {
  const next = page.next_cursor;
  const paged = hasPrevious || next !== null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {paged && pageNumber !== undefined ? (
        <span className="text-sm text-muted-foreground tabular-nums">Página {pageNumber}</span>
      ) : null}
      {hasPrevious ? (
        <Button type="button" variant="outline" onClick={onPrevious}>
          Página anterior
        </Button>
      ) : null}
      {next === null ? null : (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            onNext(next);
          }}
        >
          Página siguiente
        </Button>
      )}
    </div>
  );
}

/** Cursores de las páginas vistas, para volver atrás; reset vuelve a la primera. */
export function useCursorTrail(): {
  readonly cursor: string | null;
  readonly pager: Omit<PagerProps, 'page'>;
  readonly reset: () => void;
} {
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  return {
    cursor: cursors.at(-1) ?? null,
    pager: {
      hasPrevious: cursors.length > 1,
      pageNumber: cursors.length,
      onPrevious: () => {
        setCursors(cursors.slice(0, -1));
      },
      onNext: (cursor) => {
        setCursors([...cursors, cursor]);
      },
    },
    reset: () => {
      setCursors([null]);
    },
  };
}
