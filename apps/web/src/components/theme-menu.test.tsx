import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { ThemeProvider } from '../lib/theme/theme-provider';
import { ThemeMenu } from './theme-menu';

beforeEach(() => {
  document.documentElement.className = '';
  document.cookie = 'arza_theme=; Max-Age=0; Path=/';
});

describe('selector de apariencia (B22A)', () => {
  it('muestra las tres opciones y marca la elegida', async () => {
    render(
      <ThemeProvider initialTheme="system">
        <ThemeMenu />
      </ThemeProvider>,
    );
    expect(screen.getByRole('group', { name: 'Apariencia' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Según el sistema' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Oscuro' }));
    expect(screen.getByRole('button', { name: 'Oscuro' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Claro' })).toHaveAttribute('aria-pressed', 'false');
    expect(document.documentElement).toHaveClass('dark');
  });
});
