import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { findNavigationItem } from '../../components/app-shell/navigation';
import { ModulePlaceholder } from './module-placeholder';

// Calidad sigue en construcción (B38); Proyectos (B26) y Servicio (B28) ya están construidos.
const QUALITY = findNavigationItem('calidad');

describe('pantalla de un módulo en construcción', () => {
  it('con permiso explica en qué bloque se construye', () => {
    if (!QUALITY) throw new Error('Falta el módulo de calidad');
    render(<ModulePlaceholder item={QUALITY} granted={new Set(['qms.nonconformity.create'])} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Calidad' })).toBeVisible();
    expect(screen.getByText(/bloque B38/)).toBeVisible();
  });

  it('sin permiso no revela nada del módulo (permiso denegado, 16.5)', () => {
    if (!QUALITY) throw new Error('Falta el módulo de calidad');
    render(<ModulePlaceholder item={QUALITY} granted={new Set(['crm.lead.read'])} />);
    expect(screen.getByRole('alert')).toHaveTextContent('No tiene acceso a esta sección');
    expect(screen.queryByText('Calidad')).toBeNull();
    expect(screen.queryByText(/B38/)).toBeNull();
  });
});
