'use client';

import { CircleAlert } from 'lucide-react';
import { useEffect, useRef, type JSX } from 'react';

export interface FieldProblem {
  /** id del campo con el problema; el enlace lleva el foco hasta él. */
  readonly fieldId: string;
  readonly message: string;
}

export interface ErrorSummaryProps {
  readonly problems: readonly FieldProblem[];
  /** Lleva el foco al resumen al aparecer (16.4). Solo se apaga en muestras. */
  readonly focusOnShow?: boolean;
}

/**
 * Resumen de errores al enviar un formulario (16.4): recibe el foco, enlaza cada problema con su
 * campo y no reemplaza el mensaje junto al campo.
 */
export function ErrorSummary({
  problems,
  focusOnShow = true,
}: ErrorSummaryProps): JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null);
  const count = problems.length;
  useEffect(() => {
    if (focusOnShow && count > 0) ref.current?.focus();
  }, [count, focusOnShow]);
  if (count === 0) return null;
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      aria-labelledby="resumen-errores"
      className="flex flex-col gap-1.5 rounded-lg border border-destructive bg-destructive/8 p-4 text-sm"
    >
      <p id="resumen-errores" className="flex items-center gap-2 font-semibold text-destructive">
        <CircleAlert aria-hidden="true" className="size-4" />
        {count === 1
          ? 'Revise 1 campo antes de continuar'
          : `Revise ${String(count)} campos antes de continuar`}
      </p>
      <ul className="flex flex-col gap-1 pl-6">
        {problems.map((problem) => (
          <li key={problem.fieldId}>
            <a
              href={`#${problem.fieldId}`}
              className="text-destructive underline underline-offset-2"
            >
              {problem.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
