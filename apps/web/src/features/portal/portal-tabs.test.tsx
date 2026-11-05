import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { portalSection } from './portal-sections';
import { PortalTabs } from './portal-tabs';

vi.mock('next/navigation', () => ({ usePathname: () => '/portal/facturas' }));

describe('pestañas del portal del cliente (B22A)', () => {
  it('lleva a cada sección y marca la actual', () => {
    render(<PortalTabs />);
    const nav = screen.getByRole('navigation', { name: 'Secciones del portal' });
    expect(nav.querySelectorAll('a')).toHaveLength(6);
    expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/portal');
    expect(screen.getByRole('link', { name: 'Facturas' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Soporte' })).not.toHaveAttribute('aria-current');
  });

  it('solo reconoce las secciones que existen', () => {
    expect(portalSection('firmas')?.label).toBe('Firmas');
    expect(portalSection('')).toBeUndefined();
    expect(portalSection('otra')).toBeUndefined();
  });
});
