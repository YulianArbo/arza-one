import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { findNavigationItem } from '../../components/app-shell/navigation';
import { ModulePlaceholder } from './module-placeholder';

const FINANCE = findNavigationItem('finanzas');

describe('pantalla de un módulo en construcción', () => {
  it('con permiso explica en qué bloque se construye', () => {
    if (!FINANCE) throw new Error('Falta el módulo de finanzas');
    render(<ModulePlaceholder item={FINANCE} granted={new Set(['finance.invoice.read'])} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Finanzas' })).toBeVisible();
    expect(screen.getByText(/bloque B31/)).toBeVisible();
  });

  it('sin permiso no revela nada del módulo (permiso denegado, 16.5)', () => {
    if (!FINANCE) throw new Error('Falta el módulo de finanzas');
    render(<ModulePlaceholder item={FINANCE} granted={new Set(['crm.lead.read'])} />);
    expect(screen.getByRole('alert')).toHaveTextContent('No tiene acceso a esta sección');
    expect(screen.queryByText('Finanzas')).toBeNull();
    expect(screen.queryByText(/B31/)).toBeNull();
  });
});
