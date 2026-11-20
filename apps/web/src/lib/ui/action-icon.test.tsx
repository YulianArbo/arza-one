import { render, screen } from '@testing-library/react';
import { Ban, Check, Plus, Save, Send } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { ActionIcon, iconForAction } from './action-icon';

describe('ícono según la función de la acción (B22B)', () => {
  it('lo deduce del primer verbo, sin importar mayúsculas ni espacios', () => {
    expect(iconForAction('Guardar borrador')).toBe(Save);
    expect(iconForAction('  Registrar gasto')).toBe(Plus);
    expect(iconForAction('Enviar a aprobación')).toBe(Send);
    expect(iconForAction('APROBAR')).toBe(Check);
    expect(iconForAction('Anular el contrato')).toBe(Ban);
  });

  it('sin verbo conocido no pone ícono', () => {
    expect(iconForAction('Biblioteca de cláusulas')).toBeNull();
    expect(iconForAction('')).toBeNull();
  });

  it('el ícono es decorativo: el nombre del botón sigue siendo su texto', () => {
    render(
      <button type="button">
        <ActionIcon label="Guardar" />
        Guardar
      </button>,
    );
    const button = screen.getByRole('button', { name: 'Guardar' });
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    const { container } = render(<ActionIcon label="Ver más" />);
    expect(container).toBeEmptyDOMElement();
  });
});
