import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DOCUMENT_ID,
  LINK_ID,
  PDF_ID,
  PROCESS_ID,
  QUALITY,
  READER,
  VERSION_ID,
  documentOf,
  serveDocuments,
  versionOf,
} from '../../test-support/doc-fixtures';
import { SESSION, apiError, json, noContent, renderWithApi } from '../../test-support/fake-api';
import { Screen } from '../../test-support/privacy-fixtures';
import { DocumentDetail } from './document-detail';
import { VersionForm } from './version-form';

// Ficha y visor del documento, pasos de la versión y vínculos (B18).

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push, back: vi.fn() }),
  usePathname: () => '/app/documentos',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = (): string => 'blob:documento';
      static override revokeObjectURL = vi.fn();
    },
  );
  push.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderDetail(): void {
  renderWithApi(
    <Screen>
      <DocumentDetail id={DOCUMENT_ID} />
    </Screen>,
  );
}

async function openTab(name: string): Promise<void> {
  await userEvent.click(await screen.findByRole('tab', { name }));
}

describe('ficha y visor del documento', () => {
  it('muestra código, estado, datos y el PDF de la versión vigente', async () => {
    serveDocuments(QUALITY);
    renderDetail();
    expect(
      await screen.findByRole('heading', { name: 'PR-SGC-001 · Control de documentos' }),
    ).toBeVisible();
    expect(await screen.findByText('Procedimiento')).toBeVisible();
    const frame = await screen.findByTitle('Versión 00: Control de documentos');
    expect(frame.getAttribute('src')).toBe('blob:documento');
    expect(screen.getByRole('button', { name: 'Descargar archivo fuente' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Nueva versión' })).toBeVisible();
  });

  it('si la huella no coincide, muestra el aviso de la API en el visor', async () => {
    serveDocuments(READER, {
      [`GET /v1/documents/${DOCUMENT_ID}/versions`]: () =>
        json({ data: [versionOf({ source_file: null, actions: [] })] }),
      [`POST /v1/versions/${VERSION_ID}/download-link`]: () =>
        apiError(409, 'DOC_INTEGRITY_FAILED', 'El archivo guardado no coincide con su huella.'),
    });
    renderDetail();
    expect(await screen.findByText('El archivo guardado no coincide con su huella.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Descargar archivo fuente' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Nueva versión' })).toBeNull();
  });

  it('mientras se convierte a PDF lo dice', async () => {
    serveDocuments(QUALITY, {
      [`GET /v1/documents/${DOCUMENT_ID}/versions`]: () =>
        json({ data: [versionOf({ render_status: 'pending', pdf_file: null })] }),
    });
    renderDetail();
    expect(await screen.findByText('Convirtiendo a PDF…')).toBeVisible();
  });
});

describe('pasos de la versión', () => {
  it('aprueba con confirmación y la versión vista en If-Match', async () => {
    const inReview = versionOf({
      status: 'in_review',
      approved_by: null,
      actions: ['reject', 'approve'],
    });
    const sent = serveDocuments(QUALITY, {
      [`GET /v1/documents/${DOCUMENT_ID}/versions`]: () => json({ data: [inReview] }),
      [`POST /v1/versions/${VERSION_ID}/actions/approve`]: () => noContent(),
    });
    renderDetail();
    await openTab('Versiones');
    await userEvent.click(await screen.findByRole('button', { name: 'Aprobar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, aprobar' }));
    await vi.waitFor(() => {
      const request = sent.find((r) => r.path.endsWith('/actions/approve'));
      expect(request?.headers).toMatchObject({
        'If-Match': '"4"',
        'X-CSRF-Token': SESSION.csrf_token,
      });
    });
  });
});

describe('pasos de la versión: devolver', () => {
  it('devolver exige el motivo y lo envía', async () => {
    const inReview = versionOf({ status: 'in_review', actions: ['reject'] });
    const sent = serveDocuments(QUALITY, {
      [`GET /v1/documents/${DOCUMENT_ID}/versions`]: () => json({ data: [inReview] }),
      [`POST /v1/versions/${VERSION_ID}/actions/reject`]: () => noContent(),
    });
    renderDetail();
    await openTab('Versiones');
    await userEvent.click(await screen.findByRole('button', { name: 'Devolver' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Devolver' }));
    expect(await within(dialog).findByText(/Escriba el motivo/)).toBeVisible();
    await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Falta el alcance');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Devolver' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.path.endsWith('/actions/reject'))?.body).toEqual({
        note: 'Falta el alcance',
      });
    });
  });
});

describe('pasos de la versión: errores y publicación', () => {
  it('muestra el mensaje cuando quien elaboró intenta aprobar', async () => {
    const inReview = versionOf({ status: 'in_review', actions: ['approve'] });
    serveDocuments(QUALITY, {
      [`GET /v1/documents/${DOCUMENT_ID}/versions`]: () => json({ data: [inReview] }),
      [`POST /v1/versions/${VERSION_ID}/actions/approve`]: () =>
        apiError(403, 'DOC_SELF_APPROVAL', 'Quien elabora una versión no puede aprobarla.'),
    });
    renderDetail();
    await openTab('Versiones');
    await userEvent.click(await screen.findByRole('button', { name: 'Aprobar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, aprobar' }));
    expect(await screen.findByText('Quien elabora una versión no puede aprobarla.')).toBeVisible();
  });

  it('publica con la fecha de hoy si no se escribe otra', async () => {
    const approved = versionOf({ status: 'approved', actions: ['publish'] });
    const sent = serveDocuments(QUALITY, {
      [`GET /v1/documents/${DOCUMENT_ID}/versions`]: () => json({ data: [approved] }),
      [`POST /v1/versions/${VERSION_ID}/actions/publish`]: () => noContent(),
    });
    renderDetail();
    await openTab('Versiones');
    await userEvent.click(await screen.findByRole('button', { name: 'Publicar' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publicar' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.path.endsWith('/actions/publish'))?.body).toEqual({});
    });
  });
});

describe('vínculos', () => {
  it('lista los vínculos y vincula un proceso', async () => {
    const link = {
      id: LINK_ID,
      entity_type: 'process',
      entity_id: PROCESS_ID,
      entity_name: 'SGC · Gestión de la Calidad',
      relation: 'applies_to',
    };
    const sent = serveDocuments(QUALITY, {
      [`GET /v1/documents/${DOCUMENT_ID}/links`]: () => json({ data: [link] }),
      [`POST /v1/documents/${DOCUMENT_ID}/links`]: () => json({ id: LINK_ID }, 201),
    });
    renderDetail();
    await openTab('Vínculos');
    expect(await screen.findByText('Aplica a')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Vincular' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('option', { name: 'SGC · Gestión de la Calidad' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Registro'), PROCESS_ID);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Vincular' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'POST' && r.path.endsWith('/links'))?.body).toEqual({
        entity_type: 'process',
        entity_id: PROCESS_ID,
        relation: 'applies_to',
      });
    });
  });
});

describe('versión nueva', () => {
  it('si ya hay una versión en trámite ajena, lo explica', async () => {
    serveDocuments(QUALITY, {
      [`GET /v1/documents/${DOCUMENT_ID}`]: () =>
        json(
          documentOf({
            open_version: {
              id: VERSION_ID,
              label: '01',
              status: 'in_review',
              effective_date: null,
            },
          }),
        ),
    });
    renderWithApi(
      <Screen>
        <VersionForm id={DOCUMENT_ID} />
      </Screen>,
    );
    expect(await screen.findByText(/ya tiene una versión en trámite/)).toBeVisible();
  });
});

describe('versión nueva: borrador propio', () => {
  it('corrige el borrador propio conservando su archivo', async () => {
    const draft = versionOf({ status: 'draft', actions: ['edit', 'submit'], version: 2 });
    const sent = serveDocuments(QUALITY, {
      [`GET /v1/documents/${DOCUMENT_ID}`]: () =>
        json(
          documentOf({
            open_version: { id: VERSION_ID, label: '00', status: 'draft', effective_date: null },
          }),
        ),
      [`GET /v1/documents/${DOCUMENT_ID}/versions`]: () => json({ data: [draft] }),
      [`PATCH /v1/versions/${VERSION_ID}`]: () => noContent(),
    });
    renderWithApi(
      <Screen>
        <VersionForm id={DOCUMENT_ID} />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar borrador' }));
    await vi.waitFor(() => {
      const request = sent.find((r) => r.method === 'PATCH');
      expect(request?.headers).toMatchObject({ 'If-Match': '"2"' });
      expect(request?.body).toMatchObject({ source_file_id: PDF_ID });
    });
    expect(push).toHaveBeenCalledWith(`/app/documentos/${DOCUMENT_ID}`);
  });
});
