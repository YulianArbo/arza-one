import type { JSX } from 'react';

/** Mensaje del problema de un formulario de SST, anunciado al lector de pantalla. */
export function FormProblem({ text }: { readonly text: string | null }): JSX.Element | null {
  if (text === null) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {text}
    </p>
  );
}
