import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { findNavigationItem } from '../../components/app-shell/navigation';
import { ModulePlaceholder } from './module-placeholder';

// Contratos sigue en construcción (B24); Finanzas ya trae los parámetros tributarios (B23).
const CONTRACTS = findNavigationItem('contratos');

describe('pantalla de un módulo en construcción', () => {
  it('con permiso explica en qué bloque se construye', () => {
    if (!CONTRACTS) throw new Error('Falta el módulo de contratos');
    render(<ModulePlaceholder item={CONTRACTS} granted={new Set(['contract.read'])} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Contratos' })).toBeVisible();
    expect(screen.getByText(/bloque B24/)).toBeVisible();
  });

  it('sin permiso no revela nada del módulo (permiso denegado, 16.5)', () => {
    if (!CONTRACTS) throw new Error('Falta el módulo de contratos');
    render(<ModulePlaceholder item={CONTRACTS} granted={new Set(['crm.lead.read'])} />);
    expect(screen.getByRole('alert')).toHaveTextContent('No tiene acceso a esta sección');
    expect(screen.queryByText('Contratos')).toBeNull();
    expect(screen.queryByText(/B24/)).toBeNull();
  });
});
