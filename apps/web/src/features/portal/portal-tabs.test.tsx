import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithApi } from '../../test-support/fake-api';
import { CLIENT_ADMIN, CLIENT_USER, servePortal } from '../../test-support/portal-fixtures';
import { portalSection } from './portal-sections';
import { PortalTabs } from './portal-tabs';

// Pestañas del portal (B22A, B30): llevan a cada sección, marcan la actual y solo muestran las que
// el rol de la persona permite. Datos ficticios.

vi.mock('next/navigation', () => ({ usePathname: () => '/portal/facturas' }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pestañas del portal del cliente', () => {
  it('el administrador ve todas las secciones y se marca la actual', async () => {
    servePortal(CLIENT_ADMIN);
    renderWithApi(<PortalTabs />);
    expect(await screen.findByRole('link', { name: 'Usuarios' })).toHaveAttribute(
      'href',
      '/portal/usuarios',
    );
    const nav = screen.getByRole('navigation', { name: 'Secciones del portal' });
    expect(nav.querySelectorAll('a')).toHaveLength(9);
    expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/portal');
    expect(screen.getByRole('link', { name: 'Facturas' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Soporte' })).not.toHaveAttribute('aria-current');
  });

  it('el usuario del cliente no ve lo que su rol no permite', async () => {
    servePortal(CLIENT_USER);
    renderWithApi(<PortalTabs />);
    expect(await screen.findByRole('link', { name: 'Proyectos' })).toBeVisible();
    for (const name of ['Usuarios', 'Contratos y firmas', 'Por aprobar', 'Facturas']) {
      expect(screen.queryByRole('link', { name })).toBeNull();
    }
  });

  it('solo reconoce las secciones que existen', () => {
    expect(portalSection('firmas')?.label).toBe('Contratos y firmas');
    expect(portalSection('')).toBeUndefined();
    expect(portalSection('otra')).toBeUndefined();
  });
});
