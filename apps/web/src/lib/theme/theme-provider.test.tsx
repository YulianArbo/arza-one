import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JSX } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ThemeProvider, useTheme } from './theme-provider';

function ThemeSwitch(): JSX.Element {
  const { theme, setTheme } = useTheme();
  return (
    <>
      <p>Modo: {theme}</p>
      <button
        type="button"
        onClick={() => {
          setTheme('dark');
        }}
      >
        Oscuro
      </button>
      <button
        type="button"
        onClick={() => {
          setTheme('system');
        }}
      >
        Sistema
      </button>
    </>
  );
}

beforeEach(() => {
  document.documentElement.className = '';
  document.cookie = 'arza_theme=; Max-Age=0; Path=/';
});

describe('cambio de modo claro u oscuro', () => {
  it('aplica el modo en la página y lo recuerda en la cookie', async () => {
    render(
      <ThemeProvider initialTheme="light">
        <ThemeSwitch />
      </ThemeProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Oscuro' }));
    expect(screen.getByText('Modo: dark')).toBeVisible();
    expect(document.documentElement).toHaveClass('dark');
    expect(document.cookie).toContain('arza_theme=dark');

    await userEvent.click(screen.getByRole('button', { name: 'Sistema' }));
    expect(document.documentElement.className).toBe('');
    expect(document.cookie).toContain('arza_theme=system');
  });

  it('fuera del proveedor avisa del error de programación', () => {
    expect(() => render(<ThemeSwitch />)).toThrow('useTheme debe usarse dentro de ThemeProvider');
  });
});
