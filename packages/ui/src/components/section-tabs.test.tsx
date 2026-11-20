import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { SectionTabs } from './section-tabs.js';

const TABS = [
  { id: 'resumen', label: 'Resumen', content: () => <p>Datos generales</p> },
  { id: 'actividad', label: 'Actividad', content: () => <p>Lo que ha pasado</p> },
  { id: 'historial', label: 'Historial', content: () => <p>Cambios registrados</p> },
];

describe('pestañas de la ficha (16.3, B22B)', () => {
  it('muestra la primera pestaña y cambia con un clic', async () => {
    render(<SectionTabs label="Secciones del proyecto" tabs={TABS} />);
    expect(screen.getByRole('tablist', { name: 'Secciones del proyecto' })).toBeVisible();
    expect(screen.getByRole('tabpanel', { name: 'Resumen' })).toHaveTextContent('Datos generales');
    await userEvent.click(screen.getByRole('tab', { name: 'Historial' }));
    expect(screen.getByRole('tab', { name: 'Historial' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Cambios registrados');
  });

  it('se recorre con las flechas, Inicio y Fin, y solo la activa recibe el foco con Tab', async () => {
    render(<SectionTabs label="Secciones" tabs={TABS} />);
    const first = screen.getByRole('tab', { name: 'Resumen' });
    first.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Actividad' })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Historial' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(first).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Historial' })).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(first).toHaveFocus();
    await userEvent.keyboard('a');
    expect(first).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Actividad' })).toHaveAttribute('tabindex', '-1');
  });

  it('sin pestañas no muestra ningún panel', () => {
    render(<SectionTabs label="Vacía" tabs={[]} />);
    expect(screen.queryByRole('tabpanel')).toBeNull();
  });
});
