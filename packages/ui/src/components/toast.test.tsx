import { act, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JSX } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider, useToast } from './toast.js';

function Save({
  message = 'Los cambios quedaron guardados.',
}: {
  readonly message?: string;
}): JSX.Element {
  const { notify } = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        notify(message);
      }}
    >
      Guardar
    </button>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('aviso breve de éxito (16.5, B22B)', () => {
  it('muestra el aviso en una región viva y se cierra con su botón', async () => {
    render(
      <ToastProvider>
        <Save />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    const message = screen.getByText('Los cambios quedaron guardados.');
    expect(message.closest('[aria-live="polite"]')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
    expect(screen.queryByText('Los cambios quedaron guardados.')).toBeNull();
  });

  it('se cierra solo y conserva como máximo tres avisos', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Save />
      </ToastProvider>,
    );
    const button = screen.getByRole('button', { name: 'Guardar' });
    for (let index = 0; index < 4; index += 1) {
      act(() => {
        button.click();
      });
    }
    expect(screen.getAllByText('Los cambios quedaron guardados.')).toHaveLength(3);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText('Los cambios quedaron guardados.')).toBeNull();
  });

  it('sin proveedor no muestra nada ni falla', async () => {
    render(<Save />);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.queryByText('Los cambios quedaron guardados.')).toBeNull();
  });
});
