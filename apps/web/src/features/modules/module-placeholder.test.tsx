import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { findNavigationItem } from '../../components/app-shell/navigation';
import { ModulePlaceholder } from './module-placeholder';

// Indicadores sigue en construcción (B46); Calidad (B38), Proyectos (B26) y Servicio (B28) ya
// están construidos.
const INDICATORS = findNavigationItem('indicadores');

describe('pantalla de un módulo en construcción', () => {
  it('con permiso explica en qué bloque se construye', () => {
    if (!INDICATORS) throw new Error('Falta el módulo de indicadores');
    render(<ModulePlaceholder item={INDICATORS} granted={new Set(['dashboard.executive.read'])} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Indicadores' })).toBeVisible();
    expect(screen.getByText(/bloque B46/)).toBeVisible();
  });

  it('sin permiso no revela nada del módulo (permiso denegado, 16.5)', () => {
    if (!INDICATORS) throw new Error('Falta el módulo de indicadores');
    render(<ModulePlaceholder item={INDICATORS} granted={new Set(['crm.lead.read'])} />);
    expect(screen.getByRole('alert')).toHaveTextContent('No tiene acceso a esta sección');
    expect(screen.queryByText('Indicadores')).toBeNull();
    expect(screen.queryByText(/B46/)).toBeNull();
  });
});
