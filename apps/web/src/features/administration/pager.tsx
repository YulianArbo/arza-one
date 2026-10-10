'use client';

import { Button } from '@arza/ui';
import { useState, type JSX } from 'react';

interface PagerProps {
  readonly page: { readonly next_cursor: string | null };
  readonly hasPrevious: boolean;
  readonly onPrevious: () => void;
  readonly onNext: (cursor: string) => void;
}

/** Botones de página anterior y siguiente de un listado por cursor (numeral 14.1). */
export function Pager({ page, hasPrevious, onPrevious, onNext }: PagerProps): JSX.Element {
  const next = page.next_cursor;
  return (
    <div className="flex gap-2">
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
