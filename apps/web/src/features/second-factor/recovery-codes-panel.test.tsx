import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RecoveryCodesPanel } from './recovery-codes-panel';

const CODES = ['ABCD-EFGH-JKMN-PQR2', 'ABCD-EFGH-JKMN-PQR3'];

function renderPanel(onContinue = vi.fn()) {
  render(
    <RecoveryCodesPanel
      codes={CODES}
      email="ana@demo-uno.test"
      continueLabel="Continuar"
      onContinue={onContinue}
    />,
  );
  return { user: userEvent.setup({ delay: null }), onContinue };
}

const print = vi.fn();
const revokeObjectURL = vi.fn();

beforeEach(() => {
  print.mockReset();
  revokeObjectURL.mockReset();
  vi.stubGlobal('print', print);
  URL.createObjectURL = vi.fn(() => 'blob:codigos');
  URL.revokeObjectURL = revokeObjectURL;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('copiar los códigos', () => {
  it('copia la cuenta y los códigos numerados', async () => {
    const { user } = renderPanel();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await user.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(await screen.findByRole('button', { name: 'Copiados' })).toBeVisible();
    expect(writeText.mock.calls[0]?.[0]).toContain('Cuenta: ana@demo-uno.test');
    expect(writeText.mock.calls[0]?.[0]).toContain(' 2. ABCD-EFGH-JKMN-PQR3');
  });

  it('si el navegador lo niega, sugiere descargar o imprimir', async () => {
    const { user } = renderPanel();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denegado'));
    await user.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(await screen.findByText(/Descárguelos o imprímalos/)).toBeVisible();
  });
});

describe('descargar, imprimir y seguir', () => {
  it('descarga un archivo de texto e imprime', async () => {
    const { user } = renderPanel();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockReturnValue(undefined);
    await user.click(screen.getByRole('button', { name: 'Descargar' }));
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:codigos');
    await user.click(screen.getByRole('button', { name: 'Imprimir' }));
    expect(print).toHaveBeenCalledOnce();
  });

  it('solo sigue después de marcar que los guardó', async () => {
    const { user, onContinue } = renderPanel();
    const next = screen.getByRole('button', { name: 'Continuar' });
    expect(next).toBeDisabled();
    await user.click(screen.getByLabelText(/Guardé mis códigos/));
    await user.click(next);
    expect(onContinue).toHaveBeenCalledOnce();
  });
});
