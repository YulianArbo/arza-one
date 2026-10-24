'use client';

import { ErrorSummary, type FieldProblem } from '@arza/ui';
import type { JSX } from 'react';

/** Campo del formulario: el dato del contrato que valida, su control y su etiqueta. */
export interface SummaryField {
  readonly field: string;
  readonly id: string;
  readonly label: string;
}

/**
 * Problemas en el orden del formulario, cada uno con la etiqueta de su campo. Un problema sin
 * campo declarado igual se muestra, para no esconderlo.
 */
export function summaryOf(
  problems: Readonly<Record<string, string | undefined>>,
  fields: readonly SummaryField[],
): FieldProblem[] {
  const known = new Set(fields.map((item) => item.field));
  const listed = fields.flatMap((item) => {
    const message = problems[item.field];
    return message ? [{ fieldId: item.id, message: `${item.label}: ${message}` }] : [];
  });
  const others = Object.entries(problems).flatMap(([field, message]) =>
    message && !known.has(field) ? [{ fieldId: field, message }] : [],
  );
  return [...listed, ...others];
}

/** Resumen de errores al enviar (16.4, B22A): enlaza cada problema con su campo. */
export function FormSummary(props: {
  readonly problems: Readonly<Record<string, string | undefined>>;
  readonly fields: readonly SummaryField[];
}): JSX.Element | null {
  return <ErrorSummary problems={summaryOf(props.problems, props.fields)} />;
}
