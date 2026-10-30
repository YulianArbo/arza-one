import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { findNavigationItem } from '../../components/app-shell/navigation';
import { ModulePlaceholder } from './module-placeholder';

// Proyectos sigue en construcción (B26); Contratos ya está construido (B24).
const PROJECTS = findNavigationItem('proyectos');

describe('pantalla de un módulo en construcción', () => {
  it('con permiso explica en qué bloque se construye', () => {
    if (!PROJECTS) throw new Error('Falta el módulo de proyectos');
    render(<ModulePlaceholder item={PROJECTS} granted={new Set(['project.read_all'])} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Proyectos' })).toBeVisible();
    expect(screen.getByText(/bloque B26/)).toBeVisible();
  });

  it('sin permiso no revela nada del módulo (permiso denegado, 16.5)', () => {
    if (!PROJECTS) throw new Error('Falta el módulo de proyectos');
    render(<ModulePlaceholder item={PROJECTS} granted={new Set(['crm.lead.read'])} />);
    expect(screen.getByRole('alert')).toHaveTextContent('No tiene acceso a esta sección');
    expect(screen.queryByText('Proyectos')).toBeNull();
    expect(screen.queryByText(/B26/)).toBeNull();
  });
});
