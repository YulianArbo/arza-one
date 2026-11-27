import { render, screen } from '@testing-library/react';
import { Bot } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import type { NavigationItem } from '../../components/app-shell/navigation';
import { ModulePlaceholder } from './module-placeholder';

// Desde B46 el menú no tiene módulos en construcción; la pantalla queda para los bloques que los
// agreguen (B47 en adelante). Se prueba con un módulo de ejemplo.
const PENDING: NavigationItem = {
  slug: 'asistente',
  label: 'Asistente',
  icon: Bot,
  permissions: ['dashboard.executive.read'],
  block: 'B47',
};

describe('pantalla de un módulo en construcción', () => {
  it('con permiso explica en qué bloque se construye', () => {
    render(<ModulePlaceholder item={PENDING} granted={new Set(['dashboard.executive.read'])} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Asistente' })).toBeVisible();
    expect(screen.getByText(/bloque B47/)).toBeVisible();
  });

  it('sin permiso no revela nada del módulo (permiso denegado, 16.5)', () => {
    render(<ModulePlaceholder item={PENDING} granted={new Set(['crm.lead.read'])} />);
    expect(screen.getByRole('alert')).toHaveTextContent('No tiene acceso a esta sección');
    expect(screen.queryByText('Asistente')).toBeNull();
    expect(screen.queryByText(/B47/)).toBeNull();
  });
});
