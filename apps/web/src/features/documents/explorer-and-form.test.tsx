import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DOCUMENT_ID,
  FOLDER_ID,
  PROCESS_ID,
  REQUEST_ID,
  QUALITY,
  READER,
  UPLOAD_LINK,
  serveDocuments,
} from '../../test-support/doc-fixtures';
import { apiError, json, noContent, renderWithApi } from '../../test-support/fake-api';
import { Screen } from '../../test-support/privacy-fixtures';
import { DocumentExplorer } from './document-explorer';
import { DocumentForm } from './document-form';

// Explorador de expedientes y documento nuevo (B18).

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push, back: vi.fn() }),
  usePathname: () => '/app/documentos',
}));

const NEW_FILE = '01999a00-0000-7000-8000-00000000b302';

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  push.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderExplorer(): void {
  renderWithApi(
    <Screen>
      <DocumentExplorer />
    </Screen>,
  );
}

describe('explorador de expedientes', () => {
  it('muestra el árbol y los documentos con su código, versión y estado', async () => {
    serveDocuments(QUALITY);
    renderExplorer();
    const tree = await screen.findByRole('navigation', { name: 'Carpetas y expedientes' });
    expect(within(tree).getByRole('button', { name: /Gestión de la Calidad/ })).toBeVisible();
    expect(await screen.findByRole('link', { name: 'PR-SGC-001' })).toBeVisible();
    expect(screen.getByText('Vigente')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Nuevo documento' })).toBeVisible();
  });

  it('al elegir una carpeta pide solo sus documentos', async () => {
    const sent = serveDocuments(QUALITY);
    renderExplorer();
    const tree = await screen.findByRole('navigation', { name: 'Carpetas y expedientes' });
    await userEvent.click(within(tree).getByRole('button', { name: /^Gestión de la Calidad/ }));
    await vi.waitFor(() => {
      expect(sent.some((r) => r.search.includes(`folder_id=${FOLDER_ID}`))).toBe(true);
    });
    expect(within(tree).getByRole('button', { current: true })).toHaveTextContent(
      'Gestión de la Calidad',
    );
  });

  it('sin documentos lo dice; quien solo lee no ve las acciones de crear', async () => {
    serveDocuments(READER, { 'GET /v1/documents': () => json({ data: [], next_cursor: null }) });
    renderExplorer();
    expect(await screen.findByText('No hay documentos aquí')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Nuevo documento' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nueva carpeta' })).toBeNull();
  });
});

describe('explorador: carpetas y errores', () => {
  it('crea una carpeta dentro de la carpeta abierta', async () => {
    const sent = serveDocuments(QUALITY, {
      'POST /v1/folders': () => json({ id: FOLDER_ID }, 201),
    });
    renderExplorer();
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva carpeta' }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Actas');
    await userEvent.click(screen.getByRole('button', { name: 'Crear carpeta' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'POST' && r.path === '/v1/folders')?.body).toEqual({
        parent_id: null,
        name: 'Actas',
        kind: 'folder',
        entity_type: null,
        entity_id: null,
        classification: 'internal',
      });
    });
  });

  it('si la API falla, lo dice y deja reintentar', async () => {
    serveDocuments(QUALITY, {
      'GET /v1/folders': () => apiError(500, 'INTERNAL_ERROR', 'Ocurrió un error'),
    });
    renderExplorer();
    expect(await screen.findByRole('button', { name: /Reintentar/ })).toBeVisible();
  });
});

function renderForm(): void {
  renderWithApi(
    <Screen>
      <DocumentForm folderId={FOLDER_ID} />
    </Screen>,
  );
}

/** La subida del archivo fuente y la creación del documento. */
function uploadRoutes(): Parameters<typeof serveDocuments>[1] {
  return {
    'POST /v1/files': () =>
      json({ id: NEW_FILE, upload_url: UPLOAD_LINK, expires_at: '2026-10-16T15:15:00.000Z' }, 201),
    'PUT /v1/files/uploads/llave': () => noContent(),
    [`GET /v1/files/${NEW_FILE}`]: () =>
      json({
        id: NEW_FILE,
        file_name: 'procedimiento.pdf',
        mime_type: 'application/pdf',
        size_bytes: 8,
        sha256: 'b'.repeat(64),
        status: 'available',
        rejection: null,
        created_at: '2026-10-16T15:00:00.000Z',
      }),
    'POST /v1/documents': () => json({ id: DOCUMENT_ID }, 201),
  };
}

async function uploadSource(): Promise<void> {
  const file = new File(['%PDF-1.7'], 'procedimiento.pdf', { type: 'application/pdf' });
  await userEvent.upload(await screen.findByLabelText('Archivo fuente'), file);
  await userEvent.click(screen.getByRole('button', { name: 'Subir archivo' }));
  expect(await screen.findByText('Disponible')).toBeVisible();
}

describe('documento nuevo', () => {
  it('explica lo que falta antes de enviar', async () => {
    const sent = serveDocuments(QUALITY);
    renderForm();
    await userEvent.click(await screen.findByRole('button', { name: 'Crear documento' }));
    expect(await screen.findByText('Elija el tipo de documento.')).toBeVisible();
    // Cada problema junto a su campo y en el resumen de errores.
    expect(screen.getAllByText(/Un documento del SGC lleva el proceso/)).toHaveLength(2);
    expect(screen.getAllByText(/Suba el archivo y espere/)).toHaveLength(2);
    expect(sent.some((r) => r.method === 'POST' && r.path === '/v1/documents')).toBe(false);
  });
});

describe('documento nuevo: guardado', () => {
  it('sube el archivo, crea el documento y abre su ficha', async () => {
    const sent = serveDocuments(QUALITY, uploadRoutes());
    renderForm();
    await screen.findByRole('option', { name: 'PR · Procedimiento' });
    await screen.findByRole('option', { name: 'SGC · Gestión de la Calidad' });
    await userEvent.selectOptions(screen.getByLabelText('Tipo de documento'), 'PR');
    await userEvent.selectOptions(screen.getByLabelText('Proceso'), PROCESS_ID);
    await screen.findByRole('option', { name: 'SAD-2026-0001 · Control de documentos' });
    await userEvent.selectOptions(
      screen.getByLabelText('Solicitud de Acción Documental aprobada'),
      REQUEST_ID,
    );
    await userEvent.type(screen.getByLabelText('Título'), 'Control de documentos');
    await userEvent.type(screen.getByLabelText('Qué cambia en esta versión'), 'Creación');
    await uploadSource();
    await userEvent.click(screen.getByRole('button', { name: 'Crear documento' }));
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/app/documentos/${DOCUMENT_ID}`);
    });
    expect(sent.find((r) => r.method === 'POST' && r.path === '/v1/documents')?.body).toMatchObject(
      {
        folder_id: FOLDER_ID,
        doc_type: 'PR',
        process_id: PROCESS_ID,
        change_request_id: REQUEST_ID,
        source_file_id: NEW_FILE,
      },
    );
  });

  it('no deja subir una imagen como archivo fuente', async () => {
    serveDocuments(QUALITY);
    renderForm();
    const image = new File(['png'], 'foto.png', { type: 'image/png' });
    await userEvent.upload(await screen.findByLabelText('Archivo fuente'), image, {
      applyAccept: false,
    });
    expect(await screen.findByText(/Use un PDF, un Word/)).toBeVisible();
  });
});
