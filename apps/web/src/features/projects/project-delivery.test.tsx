import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import {
  DELIVERABLE_ID,
  DELIVERY_OPTIONS,
  ITEM_ID,
  PROJECT_ID,
  PROJECT_LEADER,
  serveProjects,
} from '../../test-support/project-fixtures';
import { ProjectDetailPanel } from './project-detail';

// Entregables y actas de entrega (B27): crear, entregar al cliente con su firmante y descargar el
// acta firmada; los avisos cuando falta el formato o los firmantes.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/proyectos',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:acta', revokeObjectURL: vi.fn() }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const BASE = `/v1/projects/${PROJECT_ID}`;
const DOWNLOAD = 'http://api.test/v1/files/downloads/acta';

async function openDeliverables(): Promise<void> {
  renderWithApi(
    <Screen>
      <ProjectDetailPanel id={PROJECT_ID} />
    </Screen>,
  );
  await userEvent.click(await screen.findByRole('tab', { name: 'Entregables' }));
}

describe('entregables', () => {
  it('crea un entregable y avisa lo que falta', async () => {
    const sent = serveProjects(PROJECT_LEADER, {
      [`POST ${BASE}/deliverables`]: () => json({ id: DELIVERABLE_ID }, 201),
    });
    await openDeliverables();
    await userEvent.click(await screen.findByRole('button', { name: 'Agregar un entregable' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Dónde está'), 'http://sin-tls');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(within(dialog).getAllByText(/Escriba el nombre/u).length).toBeGreaterThan(0);
    await userEvent.clear(within(dialog).getByLabelText('Dónde está'));
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Manual de usuario');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      const post = sent.find((request) => request.method === 'POST');
      expect(post?.body).toMatchObject({ name: 'Manual de usuario', evidence_url: null });
    });
  });
});

describe('entregar al cliente', () => {
  it('elige al firmante del cliente y envía el acta', async () => {
    const sent = serveProjects(PROJECT_LEADER, {
      [`POST ${BASE}/deliverables/${DELIVERABLE_ID}/actions/deliver`]: () =>
        json({ id: ITEM_ID }, 201),
    });
    await openDeliverables();
    await userEvent.click(await screen.findByRole('button', { name: 'Entregar al cliente' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/10 días para responder/u)).toBeVisible();
    await userEvent.type(within(dialog).getByLabelText('Mensaje para el cliente'), 'Gracias.');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Entregar y enviar el acta' }),
    );
    await vi.waitFor(() => {
      const post = sent.find((request) => request.path.endsWith('/actions/deliver'));
      expect(post?.body).toMatchObject({ environment: 'production', message: 'Gracias.' });
      expect(post?.headers['If-Match']).toBe('"2"');
    });
  });

  it('sin formato publicado o sin firmantes, lo dice', async () => {
    serveProjects(PROJECT_LEADER, {
      [`GET ${BASE}/deliverables/options`]: () =>
        json({ ...DELIVERY_OPTIONS, signers: [], form_ready: false }),
    });
    await openDeliverables();
    await userEvent.click(await screen.findByRole('button', { name: 'Entregar al cliente' }));
    expect(await screen.findByText(/FT-TEC-001 no está publicado/u)).toBeVisible();
  });
});

describe('acta firmada', () => {
  it('muestra el acta aceptada y la descarga', async () => {
    const sent = serveProjects(PROJECT_LEADER, {
      [`POST ${BASE}/deliverables/${ITEM_ID}/acta-link`]: () =>
        json({ url: DOWNLOAD, expires_at: '2026-11-06T15:05:00.000Z' }, 201),
      'GET /v1/files/downloads/acta': () => new Response('%PDF-1.7'),
      [`PUT ${BASE}/deliverables/${DELIVERABLE_ID}`]: () => noContent(),
    });
    await openDeliverables();
    expect(await screen.findByText('Aceptada y firmada')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Descargar el acta firmada' }));
    await vi.waitFor(() => {
      expect(sent.some((request) => request.path.endsWith('/acta-link'))).toBe(true);
    });
  });
});
