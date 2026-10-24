import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FormSummary, summaryOf } from './form-summary';

const FIELDS = [
  { field: 'title', id: 'titulo', label: 'Título' },
  { field: 'value', id: 'valor', label: 'Valor' },
];

describe('resumen de errores de los formularios (B22A)', () => {
  it('ordena los problemas como el formulario y no esconde los que no tienen campo', () => {
    expect(
      summaryOf({ value: 'Escriba el valor.', other: 'Otro problema.', title: '' }, FIELDS),
    ).toEqual([
      { fieldId: 'valor', message: 'Valor: Escriba el valor.' },
      { fieldId: 'other', message: 'Otro problema.' },
    ]);
  });

  it('enlaza cada problema con su campo y no aparece sin problemas', () => {
    const { rerender } = render(<FormSummary problems={{ title: 'Muy corto.' }} fields={FIELDS} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Revise 1 campo antes de continuar');
    expect(screen.getByRole('link', { name: 'Título: Muy corto.' })).toHaveAttribute(
      'href',
      '#titulo',
    );
    rerender(<FormSummary problems={{}} fields={FIELDS} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
