import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Sidebar } from './sidebar';

vi.mock('next/navigation', () => ({ usePathname: () => '/app/comercial' }));

const PERMISSIONS = ['party.read', 'crm.lead.read'];

function menuRoot(): HTMLElement {
  const nav = screen.getByRole('navigation', { name: 'Menú principal' });
  const aside = nav.closest('aside');
  if (aside === null) throw new Error('El menú no está dentro de su barra lateral.');
  return aside;
}

describe('menú lateral plegable (B49)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('se pliega y se vuelve a desplegar con un botón accesible, y lo recuerda', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Sidebar permissions={PERMISSIONS} permissionsAll={PERMISSIONS} />);
    const collapse = screen.getByRole('button', { name: 'Contraer menú' });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    expect(menuRoot()).toHaveAttribute('data-menu', 'expanded');

    await user.click(collapse);
    const expand = screen.getByRole('button', { name: 'Expandir menú' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(menuRoot()).toHaveAttribute('data-menu', 'collapsed');
    // El módulo actual sigue a la vista y marcado aunque el menú esté plegado.
    expect(screen.getByRole('link', { name: 'Comercial' })).toHaveAttribute('aria-current', 'page');

    unmount();
    render(<Sidebar permissions={PERMISSIONS} permissionsAll={PERMISSIONS} />);
    expect(await screen.findByRole('button', { name: 'Expandir menú' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Expandir menú' }));
    expect(menuRoot()).toHaveAttribute('data-menu', 'expanded');
  });
});
