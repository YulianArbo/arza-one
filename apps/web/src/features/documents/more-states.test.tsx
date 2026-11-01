import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DOCUMENT_ID,
  FOLDER_ID,
  LINK_ID,
  PROCESS_ID,
  QUALITY,
  REQUEST_ID,
  VERSION_ID,
  documentOf,
  serveDocuments,
  versionOf,
} from '../../test-support/doc-fixtures';
import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import { Screen } from '../../test-support/privacy-fixtures';
import { DocumentDetail } from './document-detail';
import { DocumentExplorer } from './document-explorer';
import { VersionForm } from './version-form';

// Más estados de las pantallas de documentos (B18): expedientes, obsoleta, vínculos retirados y
// versión nueva desde la vigente.

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push, back: vi.fn() }),
  usePathname: () => '/app/documentos',
}));

const PARTY_ID = '01999a00-0000-7000-8000-00000000b601';
const PARTIES = {
  data: [
    {
      id: PARTY_ID,
      kind: 'organization',
      name: 'Cliente Andino S.A.S.',
      id_type: 'NIT',
      id_number: '900555202',
      check_digit: 1,
      email: null,
      phone: null,
      city: null,
      status: 'active',
      roles: ['customer'],
      version: 1,
    },
  ],
  next_cursor: null,
};

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

describe('expediente de un tercero', () => {
  it('exige elegir el tercero y crea el expediente con su nombre', async () => {
    const sent = serveDocuments(QUALITY, {
      'GET /v1/parties': () => json(PARTIES),
      'POST /v1/folders': () => json({ id: FOLDER_ID }, 201),
    });
    renderWithApi(
      <Screen>
        <DocumentExplorer />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo expediente' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear expediente' }));
    expect(await within(dialog).findByText('Elija el tercero del expediente.')).toBeVisible();
    await within(dialog).findByRole('option', { name: 'Cliente Andino S.A.S.' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Tercero'), PARTY_ID);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear expediente' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'POST' && r.path === '/v1/folders')?.body).toMatchObject(
        {
          kind: 'case_file',
          entity_type: 'party',
          entity_id: PARTY_ID,
          name: 'Expediente de Cliente Andino S.A.S.',
        },
      );
    });
  });
});

describe('declarar obsoleta', () => {
  it('declara obsoleta la vigente con su motivo', async () => {
    const sent = serveDocuments(QUALITY, {
      [`POST /v1/versions/${VERSION_ID}/actions/obsolete`]: () => noContent(),
    });
    renderDetail();
    await userEvent.click(await screen.findByRole('tab', { name: 'Versiones' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Declarar obsoleta' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Se reemplaza por el manual');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Declarar obsoleta' }));
    expect(
      await within(dialog).findByText('Elija la solicitud de eliminación aprobada.'),
    ).toBeVisible();
    await userEvent.selectOptions(
      within(dialog).getByLabelText('Solicitud de Acción Documental aprobada'),
      REQUEST_ID,
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Declarar obsoleta' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.path.endsWith('/actions/obsolete'))?.body).toEqual({
        reason: 'Se reemplaza por el manual',
        change_request_id: REQUEST_ID,
      });
    });
  });
});

describe('vínculos retirados y versiones devueltas', () => {
  it('retira un vínculo con confirmación; uno sin registro dice «Registro retirado»', async () => {
    const link = {
      id: LINK_ID,
      entity_type: 'party',
      entity_id: PROCESS_ID,
      entity_name: null,
      relation: 'supports',
    };
    const sent = serveDocuments(QUALITY, {
      [`GET /v1/documents/${DOCUMENT_ID}/links`]: () => json({ data: [link] }),
      [`DELETE /v1/documents/${DOCUMENT_ID}/links/${LINK_ID}`]: () => noContent(),
    });
    renderDetail();
    await userEvent.click(await screen.findByRole('tab', { name: 'Vínculos' }));
    expect(await screen.findByText('Registro retirado')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Retirar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, retirar' }));
    await vi.waitFor(() => {
      expect(sent.some((r) => r.method === 'DELETE')).toBe(true);
    });
  });

  it('una versión devuelta muestra el motivo', async () => {
    serveDocuments(QUALITY, {
      [`GET /v1/documents/${DOCUMENT_ID}/versions`]: () =>
        json({
          data: [versionOf({ status: 'draft', review_note: 'Falta el alcance', actions: [] })],
        }),
    });
    renderDetail();
    await userEvent.click(await screen.findByRole('tab', { name: 'Versiones' }));
    expect(await screen.findByText('Devuelta: Falta el alcance')).toBeVisible();
  });
});

describe('versión nueva desde la vigente', () => {
  it('parte de los datos del documento y exige el archivo y el cambio', async () => {
    const sent = serveDocuments(QUALITY, {
      [`GET /v1/documents/${DOCUMENT_ID}`]: () => json(documentOf()),
    });
    renderWithApi(
      <Screen>
        <VersionForm id={DOCUMENT_ID} />
      </Screen>,
    );
    expect(await screen.findByDisplayValue('Control de documentos')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Crear versión' }));
    // Cada problema junto a su campo y en el resumen de errores.
    expect(await screen.findAllByText(/Suba el archivo y espere/)).toHaveLength(2);
    expect(screen.getAllByText(/Cuente en pocas palabras/)).toHaveLength(2);
    expect(sent.some((r) => r.method === 'POST' && r.path.endsWith('/versions'))).toBe(false);
  });
});
