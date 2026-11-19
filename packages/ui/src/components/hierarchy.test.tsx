import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import type { LinkProps } from '../lib/link.js';
import { AttentionList } from './attention-list.js';
import { HighlightCard } from './highlight-card.js';
import { PageHeader } from './page-header.js';
import { QuickLinks } from './quick-links.js';
import { StageSummary } from './stage-summary.js';

const NEED_STAGE = {
  key: 'need',
  label: 'Evaluar la necesidad',
  count: 3,
  caption: 'Solicitudes',
  href: '/s',
};
const STAGES = [
  NEED_STAGE,
  { key: 'order', label: 'Emitir la orden', count: 1250, caption: 'Órdenes', href: '/o' },
];

function TaggedLink({ href, children, ...rest }: LinkProps): ReactNode {
  return (
    <a href={href} data-router="next" {...rest}>
      {children}
    </a>
  );
}

describe('encabezado de página (B22B)', () => {
  it('muestra el título como encabezado principal con su descripción y acción', () => {
    render(
      <PageHeader
        title="Compras"
        description="Ubique cada compra en su recorrido."
        eyebrow="Buenos días, Andrea"
        action={<button type="button">Nueva solicitud</button>}
      >
        <p>Mensaje del día</p>
      </PageHeader>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Compras' })).toBeVisible();
    expect(screen.getByText('Ubique cada compra en su recorrido.')).toBeVisible();
    expect(screen.getByText('Buenos días, Andrea')).toBeVisible();
    expect(screen.getByText('Mensaje del día')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nueva solicitud' })).toBeVisible();
  });

  it('funciona solo con el título', () => {
    const { container } = render(<PageHeader title="Inicio" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
    expect(container.querySelectorAll('p')).toHaveLength(0);
  });
});

describe('tarjeta destacada (B22B)', () => {
  it('es una región con nombre y lleva el borde azul cuando se destaca', () => {
    render(
      <HighlightCard title="Requieren su atención" description="Tres pendientes" highlighted>
        <p>Contenido</p>
      </HighlightCard>,
    );
    const region = screen.getByRole('region', { name: 'Requieren su atención' });
    expect(region).toHaveClass('border-primary');
    expect(within(region).getByText('Tres pendientes')).toBeVisible();
  });

  it('sin destacar lleva el borde fino', () => {
    render(
      <HighlightCard title="Continuar trabajando">
        <p>Contenido</p>
      </HighlightCard>,
    );
    expect(screen.getByRole('region', { name: 'Continuar trabajando' })).not.toHaveClass(
      'border-primary',
    );
  });
});

describe('lista de pendientes (B22B)', () => {
  it('enlaza cada pendiente con su registro y oculta los adornos', () => {
    render(
      <AttentionList
        items={[
          {
            id: '1',
            title: 'Revisar solicitud de compra',
            meta: 'Compras · vence hoy',
            href: '/app/compras/solicitudes/1',
            icon: <svg />,
          },
          { id: '2', title: 'Validar informe', meta: 'Proyectos', href: '/app/proyectos/2' },
        ]}
      />,
    );
    const link = screen.getByRole('link', { name: /Revisar solicitud de compra/ });
    expect(link).toHaveAttribute('href', '/app/compras/solicitudes/1');
    expect(link).toHaveAccessibleName('Revisar solicitud de compra Compras · vence hoy');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('usa el componente de enlace que se le entrega', () => {
    render(
      <AttentionList
        linkAs={TaggedLink}
        items={[{ id: '1', title: 'Evaluar', meta: 'Talento', href: '/t' }]}
      />,
    );
    expect(screen.getByRole('link', { name: /Evaluar/ })).toHaveAttribute('data-router', 'next');
  });
});

describe('recorrido por etapas (B22B)', () => {
  it('marca la etapa actual y escribe las cifras en formato colombiano', () => {
    render(<StageSummary label="Etapas de compras" stages={STAGES} current="need" />);
    const nav = screen.getByRole('navigation', { name: 'Etapas de compras' });
    const current = within(nav).getByRole('link', { name: /Evaluar la necesidad/ });
    expect(current).toHaveAttribute('aria-current', 'step');
    expect(within(nav).getByRole('link', { name: /Emitir la orden/ })).not.toHaveAttribute(
      'aria-current',
    );
    expect(within(nav).getByText('1.250')).toBeVisible();
  });

  it('sin etapa actual no marca ninguna', () => {
    render(
      <StageSummary
        label="Etapas"
        linkAs={TaggedLink}
        stages={[{ ...NEED_STAGE, icon: <svg /> }]}
      />,
    );
    const link = screen.getByRole('link', { name: /Evaluar la necesidad/ });
    expect(link).not.toHaveAttribute('aria-current');
    expect(link).toHaveAttribute('data-router', 'next');
  });
});

describe('accesos del módulo (B22B)', () => {
  it('presenta cada acceso como enlace dentro de una sección con título', () => {
    render(
      <QuickLinks
        title="También en Compras"
        links={[
          { href: '/app/compras/proveedores', label: 'Proveedores', icon: <svg /> },
          { href: '/app/compras/viajes', label: 'Viajes' },
        ]}
      />,
    );
    const section = screen.getByRole('region', { name: 'También en Compras' });
    expect(within(section).getByRole('link', { name: 'Proveedores' })).toHaveAttribute(
      'href',
      '/app/compras/proveedores',
    );
    expect(within(section).getAllByRole('link')).toHaveLength(2);
  });

  it('usa el componente de enlace que se le entrega', () => {
    render(
      <QuickLinks
        title="También en Comercial"
        linkAs={TaggedLink}
        links={[{ href: '/c', label: 'Informe' }]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Informe' })).toHaveAttribute('data-router', 'next');
  });
});
