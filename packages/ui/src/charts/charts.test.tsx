import { fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { BarChart } from './bar-chart.js';
import { DonutChart } from './donut-chart.js';
import { FunnelBars } from './funnel-bars.js';
import { LineChart } from './line-chart.js';
import { linePaths, niceMax, xAt } from './scale.js';
import { StatCard } from './stat-card.js';

const BOX = { left: 0, right: 100, top: 0, bottom: 100 };

describe('escalas de las gráficas', () => {
  it('redondea el máximo hacia arriba a un valor cómodo de leer', () => {
    expect(niceMax([168])).toBe(200);
    expect(niceMax([23])).toBe(25);
    expect(niceMax([0, 0])).toBe(1);
  });

  it('ubica los puntos y cierra el área en la base', () => {
    expect(xAt(0, 1, BOX)).toBe(50);
    const { line, area } = linePaths([0, 50, 100], 100, BOX);
    expect(line).toBe('M0.0 100.0 L50.0 50.0 L100.0 0.0');
    expect(area.endsWith('L100.0 100 L0.0 100 Z')).toBe(true);
  });
});

describe('gráfica de líneas', () => {
  const props = {
    title: 'Oportunidades por mes',
    labels: ['Sep', 'Oct'],
    series: [
      { key: 'nuevas', label: 'Nuevas', values: [10, 20], tone: 'action' as const },
      { key: 'ganadas', label: 'Ganadas', values: [2, 5], tone: 'success' as const },
    ],
    format: (value: number) => `$ ${String(value)} M`,
  };

  it('muestra los valores del mes al pasar el cursor y los oculta al salir', () => {
    render(<LineChart {...props} />);
    // «$ 20 M» ya está en el eje y en la tabla; el recuadro del cursor agrega una más.
    const before = screen.getAllByText('$ 20 M').length;
    fireEvent.mouseEnter(screen.getByTestId('columna-Oct'));
    expect(screen.getAllByText('$ 20 M')).toHaveLength(before + 1);
    expect(screen.getByText('Ganadas', { selector: 'span' })).toBeInTheDocument();
    fireEvent.mouseLeave(screen.getByRole('img', { name: 'Oportunidades por mes' }));
    expect(screen.getAllByText('$ 20 M')).toHaveLength(before);
  });

  it('oculta y vuelve a mostrar una serie, y ofrece su tabla equivalente', async () => {
    render(<LineChart {...props} />);
    const ganadas = screen.getByRole('button', { name: 'Ganadas' });
    await userEvent.click(ganadas);
    expect(ganadas).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(ganadas);
    expect(ganadas).toHaveAttribute('aria-pressed', 'true');
    const table = screen.getByRole('table', { name: 'Oportunidades por mes' });
    expect(within(table).getByRole('row', { name: 'Oct $ 20 M $ 5 M' })).toBeInTheDocument();
  });
});

describe('barras', () => {
  it('las barras muestran cada valor y su tabla', () => {
    render(
      <BarChart
        title="Tareas por módulo"
        items={[
          { label: 'Docs', value: 14 },
          { label: 'Flujos', value: 6, tone: 'success' },
        ]}
      />,
    );
    expect(screen.getByRole('img', { name: 'Tareas por módulo' })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: 'Docs 14' })).toBeInTheDocument();
  });
});

describe('circular y embudo', () => {
  it('la circular muestra el resumen y, al señalar una parte, su porcentaje', () => {
    const { container } = render(
      <DonutChart
        title="Documentos por estado"
        items={[
          { label: 'Vigentes', value: 3, tone: 'success' },
          { label: 'Borradores', value: 1, tone: 'muted' },
        ]}
        summary={{ value: '75 %', label: 'vigentes' }}
      />,
    );
    expect(screen.getByText('75 %')).toBeVisible();
    const segment = container.querySelectorAll('circle')[2];
    fireEvent.mouseEnter(segment ?? document.body);
    expect(screen.getByText('Borradores · 25 %')).toBeVisible();
    fireEvent.mouseLeave(screen.getByRole('img', { name: 'Documentos por estado' }));
    expect(screen.getByText('vigentes')).toBeVisible();
  });

  it('el embudo lista las etapas con su valor', () => {
    render(
      <FunnelBars
        title="Embudo"
        steps={[{ label: 'Propuesta', value: 64, display: '$ 64,0 M' }]}
      />,
    );
    expect(
      within(screen.getByRole('list', { name: 'Embudo' })).getByText('$ 64,0 M'),
    ).toBeVisible();
  });
});

describe('tarjeta de indicador', () => {
  it('muestra la cifra, el cambio, la nota y la tendencia', () => {
    render(
      <StatCard
        label="Embudo abierto"
        value="$ 240,5 M"
        change={{ text: '+12 %', favorable: true }}
        note="12 oportunidades"
        trend={[1, 3, 2, 5]}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Embudo abierto' })).toBeVisible();
    expect(screen.getByText('+12 %')).toHaveClass('text-success');
    expect(screen.getByRole('img', { name: 'Tendencia de Embudo abierto' })).toBeInTheDocument();
  });

  it('un cambio desfavorable se marca en rojo y sin tendencia no hay gráfica', () => {
    render(<StatCard label="Por leer" value="3" change={{ text: '+1', favorable: false }} />);
    expect(screen.getByText('+1')).toHaveClass('text-destructive');
    expect(screen.queryByRole('img')).toBeNull();
  });
});
