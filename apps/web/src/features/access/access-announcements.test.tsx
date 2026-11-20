import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { json, mockApi, renderWithApi } from '../../test-support/fake-api';
import { AccessAnnouncements } from './access-announcements';
import { AudienceProvider, useAudience } from './audience-context';

// Comunicados en la pantalla de acceso (B36A): los de la pestaña elegida, uno a la vez, con
// flechas, puntos y teclado; sin comunicados vigentes, nada.

afterEach(() => {
  vi.unstubAllGlobals();
});

const STAFF = [
  {
    id: '01999a00-0000-7000-8000-0000000aa001',
    title: 'Mantenimiento del sábado',
    body: 'La plataforma estará en mantenimiento de 6 a 8 a. m.',
    link_url: 'https://arza.example/mantenimiento',
    has_image: false,
  },
  {
    id: '01999a00-0000-7000-8000-0000000aa002',
    title: 'Pausa activa',
    body: 'A las 3 p. m. hacemos la pausa activa.',
    link_url: null,
    has_image: false,
  },
];

const CLIENTS = [
  {
    id: '01999a00-0000-7000-8000-0000000aa003',
    title: 'Nuevo horario de soporte',
    body: 'Desde diciembre atendemos de 7 a. m. a 7 p. m.',
    link_url: null,
    has_image: false,
  },
];

function serve(staff = STAFF, clients = CLIENTS) {
  return mockApi({
    'GET /v1/public/announcements': (request) =>
      json({ data: request.search.includes('clients') ? clients : staff }),
  });
}

function ClientsTab() {
  const { setAudience } = useAudience();
  return (
    <button
      type="button"
      onClick={() => {
        setAudience('clientes');
      }}
    >
      Portal de clientes
    </button>
  );
}

function show() {
  renderWithApi(
    <AudienceProvider>
      <ClientsTab />
      <AccessAnnouncements tone="light" />
    </AudienceProvider>,
  );
}

describe('comunicados en el acceso', () => {
  it('pasa de uno a otro con las flechas, los puntos y el teclado', async () => {
    serve();
    show();
    expect(await screen.findByText('Mantenimiento del sábado')).toBeVisible();
    expect(screen.getByText('Comunicado 1 de 2')).toBeVisible();
    expect(screen.getByRole('link', { name: /Ver más/u })).toHaveAttribute('target', '_blank');
    await userEvent.click(screen.getByRole('button', { name: 'Comunicado siguiente' }));
    expect(screen.getByText('Pausa activa')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Ver el comunicado 1 de 2' }));
    expect(screen.getByText('Mantenimiento del sábado')).toBeVisible();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByText('Pausa activa')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ver el comunicado 2 de 2' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('al elegir «Portal de clientes» muestra los comunicados para clientes', async () => {
    const sent = serve();
    show();
    expect(await screen.findByText('Mantenimiento del sábado')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Portal de clientes' }));
    expect(await screen.findByText('Nuevo horario de soporte')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Comunicado siguiente' })).toBeNull();
    expect(sent.map((request) => request.search)).toContain('?audience=clients');
  });

  it('sin comunicados vigentes no muestra nada', async () => {
    const sent = serve([], []);
    show();
    await vi.waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(screen.queryByRole('region', { name: 'Comunicados' })).toBeNull();
  });
});
