import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { findNavigationItem } from '../../components/app-shell/navigation';
import { ModulePlaceholder } from './module-placeholder';

// Servicio sigue en construcción (B28); Proyectos ya está construido (B26).
const SERVICE = findNavigationItem('servicio');

describe('pantalla de un módulo en construcción', () => {
  it('con permiso explica en qué bloque se construye', () => {
    if (!SERVICE) throw new Error('Falta el módulo de servicio');
    render(<ModulePlaceholder item={SERVICE} granted={new Set(['service.ticket.read'])} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Servicio' })).toBeVisible();
    expect(screen.getByText(/bloque B28/)).toBeVisible();
  });

  it('sin permiso no revela nada del módulo (permiso denegado, 16.5)', () => {
    if (!SERVICE) throw new Error('Falta el módulo de servicio');
    render(<ModulePlaceholder item={SERVICE} granted={new Set(['crm.lead.read'])} />);
    expect(screen.getByRole('alert')).toHaveTextContent('No tiene acceso a esta sección');
    expect(screen.queryByText('Servicio')).toBeNull();
    expect(screen.queryByText(/B28/)).toBeNull();
  });
});
