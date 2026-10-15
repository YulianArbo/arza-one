import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import {
  SESSION,
  apiError,
  json,
  mockApi,
  noContent,
  renderWithApi,
} from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { FileList } from './file-list';
import { formatSize, uploadProblem } from './labels';

// Pantalla de archivos (B14): carga, estados del análisis, vista previa y descarga.

const AVAILABLE_ID = '01999a00-0000-7000-8000-00000000d001';
const LINK = 'http://api.test/v1/files/downloads/llave';
const UPLOAD_LINK = 'http://api.test/v1/files/uploads/llave';
const SHA = 'a'.repeat(64);

const AVAILABLE = {
  id: AVAILABLE_ID,
  file_name: 'Acta de visita.pdf',
  mime_type: 'application/pdf',
  size_bytes: 2_621_440,
  sha256: SHA,
  status: 'available',
  rejection: null,
  created_at: '2026-10-15T15:00:00.000Z',
};
const REJECTED = {
  ...AVAILABLE,
  id: '01999a00-0000-7000-8000-00000000d002',
  file_name: 'eicar.pdf',
  status: 'rejected',
  rejection: 'virus',
};
const SCANNING = {
  ...AVAILABLE,
  id: '01999a00-0000-7000-8000-00000000d003',
  file_name: 'Foto.png',
  mime_type: 'image/png',
  sha256: null,
  status: 'scanning',
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/archivos',
}));

const UPLOADER = permissionsOf(['doc.document.read', 'doc.document.create']);
const READER = permissionsOf(['doc.document.read']);

type Routes = Parameters<typeof mockApi>[0];

function serveFiles(permissions: object, extra: Routes = {}) {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissions),
    'GET /v1/files': () => json({ data: [AVAILABLE, REJECTED, SCANNING] }),
    [`POST /v1/files/${AVAILABLE_ID}/download-link`]: () =>
      json({ url: LINK, expires_at: '2026-10-15T15:05:00.000Z' }),
    ...extra,
  });
}

function renderList(): void {
  renderWithApi(
    <Screen>
      <FileList />
    </Screen>,
  );
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('lista de archivos', () => {
  it('muestra cada estado, el motivo del rechazo y la huella', async () => {
    serveFiles(READER);
    renderList();
    expect(await screen.findByText('Acta de visita.pdf')).toBeVisible();
    expect(screen.getByText('Disponible')).toBeVisible();
    expect(screen.getByText('Rechazado')).toBeVisible();
    expect(screen.getByText('El antivirus encontró un virus')).toBeVisible();
    expect(screen.getByText('En análisis')).toBeVisible();
    expect(screen.getAllByText(SHA)).toHaveLength(2);
    expect(screen.getAllByText('PDF · 2,5 MB · 15/10/2026, 10:00 a. m.')).toHaveLength(2);
  });

  it('sin permiso de crear no ofrece la carga; sin archivos lo dice', async () => {
    serveFiles(READER, { 'GET /v1/files': () => json({ data: [] }) });
    renderList();
    expect(await screen.findByText('Todavía no hay archivos')).toBeVisible();
    expect(screen.queryByRole('form', { name: 'Subir un archivo' })).toBeNull();
  });

  it('si la API falla, lo dice y deja reintentar', async () => {
    serveFiles(READER, {
      'GET /v1/files': () => apiError(500, 'INTERNAL_ERROR', 'Ocurrió un error'),
    });
    renderList();
    expect(await screen.findByRole('button', { name: /Reintentar/ })).toBeVisible();
  });
});

describe('descarga y vista previa', () => {
  it('descarga por el enlace de cinco minutos', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const sent = serveFiles(READER);
    renderList();
    await userEvent.click(await screen.findByRole('button', { name: 'Descargar' }));
    await vi.waitFor(() => {
      expect(open).toHaveBeenCalledWith(LINK, '_self');
    });
    expect(sent.find((request) => request.path.endsWith('/download-link'))?.headers).toMatchObject({
      'X-CSRF-Token': SESSION.csrf_token,
    });
  });

  it('sin permiso para el archivo muestra el mensaje de la API', async () => {
    serveFiles(READER, {
      [`POST /v1/files/${AVAILABLE_ID}/download-link`]: () =>
        apiError(404, 'FILE_NOT_FOUND', 'El archivo no existe.'),
    });
    renderList();
    await userEvent.click(await screen.findByRole('button', { name: 'Descargar' }));
    expect(await screen.findByText('El archivo no existe.')).toBeVisible();
  });
});

describe('vista previa', () => {
  it('muestra la vista previa del PDF desde la memoria del navegador', async () => {
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL = (): string => 'blob:vista';
        static override revokeObjectURL = vi.fn();
      },
    );
    serveFiles(READER, { 'GET /v1/files/downloads/llave': () => new Response('%PDF-1.7') });
    renderList();
    await userEvent.click(await screen.findByRole('button', { name: 'Vista previa' }));
    const dialog = await screen.findByRole('dialog');
    const frame = await within(dialog).findByTitle('Vista previa de Acta de visita.pdf');
    expect(frame.getAttribute('src')).toBe('blob:vista');
  });

  it('si el enlace de la vista previa falla, lo dice', async () => {
    serveFiles(READER, {
      'GET /v1/files/downloads/llave': () =>
        apiError(404, 'FILE_LINK_INVALID', 'El enlace no es válido, ya se usó o venció.'),
    });
    renderList();
    await userEvent.click(await screen.findByRole('button', { name: 'Vista previa' }));
    expect(await screen.findByText(/ya se usó o venció/)).toBeVisible();
  });
});

describe('carga de archivos', () => {
  it('sube el archivo por su enlace y avisa que queda en análisis', async () => {
    const sent = serveFiles(UPLOADER, {
      'POST /v1/files': () =>
        json(
          { id: AVAILABLE_ID, upload_url: UPLOAD_LINK, expires_at: '2026-10-15T15:15:00.000Z' },
          201,
        ),
      'PUT /v1/files/uploads/llave': () => noContent(),
    });
    renderList();
    const file = new File(['%PDF-1.7'], 'informe.pdf', { type: 'application/pdf' });
    await userEvent.upload(
      await screen.findByLabelText('Elija un archivo o arrástrelo aquí'),
      file,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Subir archivo' }));
    expect(await screen.findByText(/queda «En análisis»/)).toBeVisible();
    expect(
      sent.find((request) => request.method === 'POST' && request.path === '/v1/files')?.body,
    ).toEqual({
      file_name: 'informe.pdf',
      mime_type: 'application/pdf',
      size_bytes: 8,
    });
    expect(sent.some((request) => request.method === 'PUT')).toBe(true);
  });

  it('no envía un tipo fuera de la lista blanca y explica por qué', async () => {
    const sent = serveFiles(UPLOADER);
    renderList();
    const exe = new File(['MZ'], 'programa.exe', { type: 'application/x-msdownload' });
    const input = await screen.findByLabelText('Elija un archivo o arrástrelo aquí');
    await userEvent.upload(input, exe, { applyAccept: false });
    expect(await screen.findByText(/Ese tipo de archivo no está permitido/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Subir archivo' })).toBeDisabled();
    expect(sent.some((request) => request.path === '/v1/files' && request.method === 'POST')).toBe(
      false,
    );
  });
});

describe('carga de archivos: errores', () => {
  it('si el enlace de subida falla, muestra el mensaje de la API', async () => {
    serveFiles(UPLOADER, {
      'POST /v1/files': () =>
        json(
          { id: AVAILABLE_ID, upload_url: UPLOAD_LINK, expires_at: '2026-10-15T15:15:00.000Z' },
          201,
        ),
      'PUT /v1/files/uploads/llave': () =>
        apiError(
          422,
          'FILE_SIZE_MISMATCH',
          'El tamaño del archivo enviado no es el que se declaró.',
        ),
    });
    renderList();
    const file = new File(['%PDF-1.7'], 'informe.pdf', { type: 'application/pdf' });
    await userEvent.upload(
      await screen.findByLabelText('Elija un archivo o arrástrelo aquí'),
      file,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Subir archivo' }));
    expect(await screen.findByText(/El tamaño del archivo enviado/)).toBeVisible();
  });
});

describe('reglas de la carga en la pantalla', () => {
  it('explica un archivo vacío o demasiado grande', () => {
    expect(uploadProblem(new File([], 'vacio.pdf', { type: 'application/pdf' }))).toBe(
      'El archivo está vacío.',
    );
    const big = new File(['x'], 'grande.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 21 * 1024 * 1024 });
    expect(uploadProblem(big)).toBe('El archivo pesa más de 20 MB.');
  });

  it('muestra tamaños en KB y MB', () => {
    expect(formatSize(512 * 1024)).toBe('512 KB');
    expect(formatSize(10)).toBe('0,1 KB');
  });
});
