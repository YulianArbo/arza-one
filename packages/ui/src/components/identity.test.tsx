import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ErrorSummary } from '../states/error-summary.js';
import { Avatar } from './avatar.js';

describe('avatar', () => {
  it('sin foto muestra hasta dos iniciales con el nombre como texto alternativo', () => {
    render(<Avatar name="Demo Uno S.A.S." />);
    expect(screen.getByRole('img', { name: 'Demo Uno S.A.S.' })).toHaveTextContent('DU');
  });

  it('con foto muestra la imagen', () => {
    render(<Avatar name="Ana Pérez" src="/foto.png" size="lg" />);
    expect(screen.getByRole('img', { name: 'Ana Pérez' })).toHaveAttribute('src', '/foto.png');
  });
});

describe('resumen de errores (16.4)', () => {
  it('recibe el foco y enlaza cada problema con su campo', () => {
    render(
      <ErrorSummary
        problems={[
          { fieldId: 'titulo', message: 'Escriba el título' },
          { fieldId: 'archivo', message: 'Adjunte el archivo' },
        ]}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveFocus();
    expect(alert).toHaveTextContent('Revise 2 campos antes de continuar');
    expect(screen.getByRole('link', { name: 'Escriba el título' })).toHaveAttribute(
      'href',
      '#titulo',
    );
  });

  it('con un solo problema lo dice en singular y sin problemas no muestra nada', () => {
    const { rerender } = render(
      <ErrorSummary problems={[{ fieldId: 'correo', message: 'Falta el correo' }]} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Revise 1 campo antes de continuar');
    rerender(<ErrorSummary problems={[]} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
