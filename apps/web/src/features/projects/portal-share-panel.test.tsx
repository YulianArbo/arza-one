import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import {
  PROJECT_ID,
  PROJECT_LEADER,
  PROJECT_READER,
  serveProjects,
} from '../../test-support/project-fixtures';
import { ProjectDetailPanel } from './project-detail';

// Lo que el líder comparte con el cliente en su portal (B30, decisiones 2 y 5). Datos ficticios.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/proyectos',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const BASE = `/v1/projects/${PROJECT_ID}`;
const SHARED_ID = '01999a00-0000-7000-8000-0000000fa601';
const FILE_ID = '01999a00-0000-7000-8000-0000000fa611';

const SHARED = {
  visible: true,
  can_share: true,
  data: [
    {
      id: SHARED_ID,
      file_id: FILE_ID,
      title: 'Manual de usuario',
      shared_by: { id: FILE_ID, name: 'Laura Líder' },
      shared_at: '2026-11-07T15:00:00.000Z',
    },
  ],
};

const FILES = {
  data: [
    {
      id: FILE_ID,
      file_name: 'manual.pdf',
      mime_type: 'application/pdf',
      size_bytes: 1000,
      sha256: null,
      status: 'available',
      rejection: null,
      created_at: '2026-11-07T15:00:00.000Z',
    },
  ],
};

async function openPortalTab(): Promise<void> {
  renderWithApi(
    <Screen>
      <ProjectDetailPanel id={PROJECT_ID} />
    </Screen>,
  );
  await userEvent.click(await screen.findByRole('tab', { name: 'Portal del cliente' }));
}

describe('portal del cliente: ver y ocultar', () => {
  it('el líder oculta el proyecto y deja de compartir un archivo', async () => {
    const sent = serveProjects(PROJECT_LEADER, {
      [`GET ${BASE}/shared-files`]: () => json(SHARED),
      [`PUT ${BASE}/portal`]: () => noContent(),
      [`DELETE ${BASE}/shared-files/${SHARED_ID}`]: () => noContent(),
    });
    await openPortalTab();
    await userEvent.click(await screen.findByRole('button', { name: 'Ocultar en el portal' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Dejar de compartir Manual de usuario' }),
    );
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'PUT')?.body).toEqual({ visible: false });
      expect(sent.some((r) => r.method === 'DELETE')).toBe(true);
    });
  });
});

describe('portal del cliente: compartir', () => {
  it('comparte un archivo después de validar', async () => {
    const sent = serveProjects(PROJECT_LEADER, {
      [`GET ${BASE}/shared-files`]: () => json({ ...SHARED, data: [] }),
      'GET /v1/files': () => json(FILES),
      [`POST ${BASE}/shared-files`]: () => json({ id: SHARED_ID }, 201),
    });
    await openPortalTab();
    expect(await screen.findByText('Nada compartido todavía')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Compartir un archivo' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Compartir' }));
    expect(within(dialog).getAllByText('Elija el archivo.').length).toBeGreaterThan(0);
    await userEvent.selectOptions(within(dialog).getByLabelText('Archivo'), FILE_ID);
    await userEvent.type(within(dialog).getByLabelText('Cómo lo verá el cliente'), 'Manual');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Compartir' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'POST')?.body).toEqual({
        file_id: FILE_ID,
        title: 'Manual',
      });
    });
  });
});

describe('portal del cliente: solo lectura', () => {
  it('quien solo lee ve que está oculto, sin botones', async () => {
    serveProjects(PROJECT_READER, {
      [`GET ${BASE}/shared-files`]: () => json({ ...SHARED, visible: false, can_share: false }),
    });
    await openPortalTab();
    expect(await screen.findByText(/está oculto en el portal/u)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Compartir un archivo' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Dejar de compartir/u })).toBeNull();
  });
});
