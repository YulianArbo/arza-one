import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BackToModule } from './back-to-module';
import { NavigationList } from './navigation-list';

const route = vi.hoisted(() => ({ pathname: '/app' }));

vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));

const PERMISSIONS = ['party.read', 'crm.lead.read', 'purchase.read', 'audit.event.read'];

function renderMenu(): void {
  render(
    <nav aria-label="Menú principal">
      <NavigationList permissions={PERMISSIONS} />
    </nav>,
  );
}

describe('menú por grupos (B22B)', () => {
  beforeEach(() => {
    route.pathname = '/app';
    window.localStorage.clear();
  });

  it('muestra los grupos abiertos con sus módulos y marca el actual', () => {
    route.pathname = '/app/comercial/oportunidades';
    renderMenu();
    const group = screen.getByRole('button', { name: 'Clientes y operación' });
    expect(group).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Comercial' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Terceros' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Inicio' })).toBeVisible();
  });
});

describe('grupos que se contraen (B22B)', () => {
  beforeEach(() => {
    route.pathname = '/app';
    window.localStorage.clear();
  });

  it('contrae un grupo, lo recuerda y lo vuelve a abrir', async () => {
    renderMenu();
    const group = screen.getByRole('button', { name: 'Gestión interna' });
    await userEvent.click(group);
    expect(group).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Compras' })).toBeNull();
    expect(window.localStorage.getItem('arza.menu.collapsed')).toBe('["gestion"]');
    await userEvent.click(group);
    expect(screen.getByRole('link', { name: 'Compras' })).toBeVisible();
    expect(window.localStorage.getItem('arza.menu.collapsed')).toBe('[]');
  });

  it('el grupo del módulo actual queda abierto aunque se haya contraído', () => {
    window.localStorage.setItem('arza.menu.collapsed', '["gobierno", 7]');
    route.pathname = '/app/auditoria';
    renderMenu();
    const nav = screen.getByRole('navigation', { name: 'Menú principal' });
    expect(within(nav).getByRole('link', { name: 'Auditoría' })).toBeVisible();
  });

  it('sin almacenamiento legible el menú sigue abierto', () => {
    window.localStorage.setItem('arza.menu.collapsed', 'no es json');
    renderMenu();
    expect(screen.getByRole('link', { name: 'Compras' })).toBeVisible();
  });

  it('avisa al cerrar el menú de celular cuando se elige un módulo', async () => {
    const onNavigate = vi.fn();
    render(<NavigationList permissions={PERMISSIONS} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByRole('link', { name: 'Terceros' }));
    expect(onNavigate).toHaveBeenCalledOnce();
  });
});

describe('«Volver a» (B22B)', () => {
  it('aparece en las páginas internas y lleva al módulo', () => {
    route.pathname = '/app/compras/solicitudes';
    render(<BackToModule />);
    expect(screen.getByRole('link', { name: 'Volver a Compras' })).toHaveAttribute(
      'href',
      '/app/compras',
    );
  });

  it('no aparece en la portada del módulo', () => {
    route.pathname = '/app/compras';
    const { container } = render(<BackToModule />);
    expect(container).toBeEmptyDOMElement();
  });
});
