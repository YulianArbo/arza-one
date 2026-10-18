import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DOCUMENT_ID,
  QUALITY_SGC,
  READER,
  REQUEST_ID,
  documentOf,
  requestOf,
  serveDocuments,
} from '../../test-support/doc-fixtures';
import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import { Screen } from '../../test-support/privacy-fixtures';
import { DocumentDetail } from './document-detail';
import { MasterList } from './master-list';
import { VersionForm } from './version-form';

// Listado Maestro, constancia de lectura y solicitud de la versión nueva (B19).

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
      static override createObjectURL = (): string => 'blob:listado';
      static override revokeObjectURL = vi.fn();
    },
  );
  push.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ENTRY = {
  document_id: DOCUMENT_ID,
  code: 'PR-SGC-001',
  title: 'Control de documentos',
  doc_type: 'PR',
  doc_type_label: 'Procedimiento',
  process: { id: DOCUMENT_ID, code: 'SGC', name: 'Gestión de la Calidad' },
  version_label: '03',
  effective_date: '2025-03-15',
  status: 'current',
  owner_position: 'Coordinador de Calidad',
};

describe('Listado Maestro', () => {
  it('muestra cada documento con su versión y fecha, y exporta con los filtros', async () => {
    const sent = serveDocuments(QUALITY_SGC, {
      'GET /v1/master-list': () => json({ data: [ENTRY], total: 1 }),
      'POST /v1/master-list/export': () =>
        new Response('Código;Nombre', {
          headers: { 'content-disposition': 'attachment; filename="listado-maestro.csv"' },
        }),
    });
    renderWithApi(
      <Screen>
        <MasterList />
      </Screen>,
    );
    expect(await screen.findByRole('link', { name: 'PR-SGC-001' })).toBeVisible();
    expect(screen.getByText('15/03/2025')).toBeVisible();
    expect(screen.getByText('1 documentos.')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Buscar por código o nombre'), 'Control');
    await userEvent.click(screen.getByRole('button', { name: 'Exportar' }));
    expect(await screen.findByText(/listado-maestro.csv/)).toBeVisible();
    expect(sent.find((r) => r.path === '/v1/master-list/export')?.body).toEqual({
      status: 'current',
      q: 'Control',
    });
  });

  it('sin documentos lo explica; sin el permiso no ofrece exportar', async () => {
    serveDocuments(READER, { 'GET /v1/master-list': () => json({ data: [], total: 0 }) });
    renderWithApi(
      <Screen>
        <MasterList />
      </Screen>,
    );
    expect(await screen.findByText('No hay documentos con estos filtros')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Exportar' })).toBeNull();
  });
});

const READING = `GET /v1/documents/${DOCUMENT_ID}/acknowledgements`;

function report(overrides: object = {}): object {
  return {
    document_id: DOCUMENT_ID,
    version: { id: DOCUMENT_ID, label: '00' },
    mine: { requested_at: '2026-10-16T13:05:00.000Z', acknowledged_at: null },
    can_acknowledge: true,
    totals: { requested: 2, acknowledged: 1 },
    positions: [
      {
        position: { id: DOCUMENT_ID, name: 'Analista de calidad' },
        readers: [
          {
            user: { id: DOCUMENT_ID, name: 'Luis Gómez' },
            requested_at: '2026-10-16T13:05:00.000Z',
            acknowledged_at: '2026-10-16T15:00:00.000Z',
          },
        ],
      },
    ],
    ...overrides,
  };
}

async function openReading(): Promise<void> {
  renderWithApi(
    <Screen>
      <DocumentDetail id={DOCUMENT_ID} />
    </Screen>,
  );
  await userEvent.click(await screen.findByRole('tab', { name: 'Lectura' }));
}

describe('constancia de lectura', () => {
  it('la persona confirma su lectura y Calidad ve quién leyó, por cargo', async () => {
    const sent = serveDocuments(QUALITY_SGC, {
      [READING]: () => json(report()),
      [`POST /v1/documents/${DOCUMENT_ID}/acknowledgements/mine`]: () => noContent(),
      [`POST /v1/documents/${DOCUMENT_ID}/acknowledgement-requests`]: () => json({ requested: 1 }),
    });
    await openReading();
    expect(await screen.findByText(/1 de 2 personas confirmaron/)).toBeVisible();
    expect(screen.getByText('Luis Gómez')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmo que leí este documento' }));
    await userEvent.click(screen.getByRole('button', { name: 'Solicitar constancia de lectura' }));
    expect(await screen.findByText(/Se pidió la lectura a 1 personas/)).toBeVisible();
    expect(sent.some((r) => r.path.endsWith('/acknowledgements/mine'))).toBe(true);
  });

  it('ya confirmada lo dice y quien solo lee no pide lecturas', async () => {
    const mine = { requested_at: null, acknowledged_at: '2026-10-16T15:00:00.000Z' };
    serveDocuments(READER, { [READING]: () => json(report({ mine, positions: [] })) });
    await openReading();
    expect(await screen.findByText(/Usted confirmó la lectura el/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Solicitar constancia de lectura' })).toBeNull();
  });

  it('sin versión vigente explica cuándo se pide la lectura', async () => {
    serveDocuments(READER, { [READING]: () => json(report({ version: null, mine: null })) });
    await openReading();
    expect(await screen.findByText('Todavía no hay una versión vigente')).toBeVisible();
  });
});

describe('versión nueva de un documento del SGC', () => {
  it('pide la solicitud de modificación aprobada y la envía', async () => {
    const update = requestOf({ action: 'update', doc_type: null, process: null });
    const sent = serveDocuments(QUALITY_SGC, {
      'GET /v1/change-requests': () => json({ data: [update], next_cursor: null }),
      [`GET /v1/documents/${DOCUMENT_ID}`]: () => json(documentOf()),
    });
    renderWithApi(
      <Screen>
        <VersionForm id={DOCUMENT_ID} />
      </Screen>,
    );
    await screen.findByRole('option', { name: 'SAD-2026-0001 · Control de documentos' });
    await userEvent.click(screen.getByRole('button', { name: 'Crear versión' }));
    expect(await screen.findByText('Elija la solicitud de modificación aprobada.')).toBeVisible();
    await userEvent.selectOptions(
      screen.getByLabelText('Solicitud de Acción Documental aprobada'),
      REQUEST_ID,
    );
    expect(sent.some((r) => r.search.includes(`document_id=${DOCUMENT_ID}`))).toBe(true);
  });
});
