import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PortalTrail } from './portal-trail';

const route = vi.hoisted(() => ({ pathname: '/portal' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));

describe('ruta del portal (B22B)', () => {
  it('en el inicio solo dice dónde está', () => {
    route.pathname = '/portal';
    render(<PortalTrail />);
    expect(screen.getByText('Portal de clientes')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Volver al portal' })).toBeNull();
  });

  it('en una sección, o en una ficha dentro de ella, ofrece volver al portal', () => {
    route.pathname = '/portal/proyectos/0199-proyecto';
    render(<PortalTrail />);
    expect(screen.getByRole('link', { name: 'Volver al portal' })).toHaveAttribute(
      'href',
      '/portal',
    );
    expect(screen.getByRole('navigation', { name: 'Ruta de navegación' })).toHaveTextContent(
      'Portal de clientes / Proyectos',
    );
  });
});
