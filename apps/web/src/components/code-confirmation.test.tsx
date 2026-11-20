import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CodeConfirmation, codeMatches } from './code-confirmation';
import { ConfirmActionButton } from './confirm-action-button';

const FIELD = 'Para confirmar, escriba el código FAC-0007';

describe('confirmación con código de las acciones irreversibles (B22B)', () => {
  it('compara el código sin importar espacios ni mayúsculas', () => {
    expect(codeMatches(' fac-0007 ', 'FAC-0007')).toBe(true);
    expect(codeMatches('FAC-0008', 'FAC-0007')).toBe(false);
  });

  it('no deja enviar el formulario hasta que el código coincida', () => {
    const submit = vi.fn((event: { preventDefault: () => void }) => {
      event.preventDefault();
    });
    render(
      <CodeConfirmation code="FAC-0007">
        <form onSubmit={submit}>
          <button type="submit">Anular factura</button>
        </form>
      </CodeConfirmation>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Anular factura' }));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText(/Escriba el código FAC-0007 tal como aparece/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(FIELD), { target: { value: 'fac-0007' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anular factura' }));
    expect(submit).toHaveBeenCalledTimes(1);
  });
});

describe('ventana de confirmación con código (B22B)', () => {
  it('la ventana de confirmación pide el código antes de confirmar', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmActionButton
        label="Aprobar disposición"
        title="Aprobar"
        description="Se ejecuta la disposición."
        confirmLabel="Sí, aprobar"
        disabled={false}
        confirmCode="FAC-0007"
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar disposición' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, aprobar' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(FIELD), { target: { value: 'FAC-0007' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sí, aprobar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
