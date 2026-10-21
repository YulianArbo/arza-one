import { fireEvent, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GlobalSearch } from '../../components/app-shell/global-search';
import { DOCUMENT_ID, READER, documentOf, serveDocuments } from '../../test-support/doc-fixtures';
import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import { Screen } from '../../test-support/privacy-fixtures';
import {
  ITEM_ID,
  PROPOSAL_ID,
  RETENTION_DIRECTOR,
  RETENTION_OF_DOCUMENT,
  RETENTION_QUALITY,
  proposalOf,
} from '../../test-support/retention-fixtures';
import { DispositionDetail } from './disposition-detail';
import { DocumentDetail } from './document-detail';

// Ficha de la propuesta de disposición, retención del documento y búsqueda global (B21).

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/documentos',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const PROPOSAL_PATH = `GET /v1/dispositions/${PROPOSAL_ID}`;

function showProposal(permissions: object, proposal: object, extra = {}) {
  const sent = serveDocuments(permissions, {
    [PROPOSAL_PATH]: () => json(proposal),
    [`PUT /v1/dispositions/${PROPOSAL_ID}/items/${ITEM_ID}`]: () => noContent(),
    [`POST /v1/dispositions/${PROPOSAL_ID}/actions/send`]: () => noContent(),
    [`POST /v1/dispositions/${PROPOSAL_ID}/actions/approve`]: () => noContent(),
    [`POST /v1/dispositions/${PROPOSAL_ID}/actions/reject`]: () => noContent(),
    ...extra,
  });
  renderWithApi(
    <Screen>
      <DispositionDetail id={PROPOSAL_ID} />
    </Screen>,
  );
  return sent;
}

describe('ficha de la propuesta: revisión de Calidad', () => {
  it('conserva un documento con su motivo, que es obligatorio', async () => {
    const sent = showProposal(RETENTION_QUALITY, proposalOf());
    expect(await screen.findByText('Valor histórico', { exact: false })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Conservar DOC-2015-0001' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Conservar' }));
    expect(
      await within(dialog).findByText('Escriba el motivo (5 a 500 caracteres).'),
    ).toBeVisible();
    await userEvent.type(
      within(dialog).getByLabelText('Por qué se conserva'),
      'Lo pide el cliente.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Conservar' }));
    await vi.waitFor(() => {
      const put = sent.find((r) => r.method === 'PUT');
      expect(put?.body).toEqual({ action: 'keep', keep_reason: 'Lo pide el cliente.' });
      expect(put?.headers['If-Match']).toBe('"1"');
    });
  });

  it('envía la propuesta a aprobación después de confirmar', async () => {
    const sent = showProposal(RETENTION_QUALITY, proposalOf());
    await userEvent.click(await screen.findByRole('button', { name: 'Enviar a aprobación' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, enviar a aprobación' }));
    await vi.waitFor(() => {
      expect(sent.some((r) => r.path.endsWith('/actions/send'))).toBe(true);
    });
  });

  it('vuelve a eliminar un documento que se iba a conservar', async () => {
    const sent = showProposal(RETENTION_QUALITY, proposalOf());
    await userEvent.click(await screen.findByRole('button', { name: 'Volver a eliminar' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'PUT')?.body).toEqual({
        action: 'destroy',
        keep_reason: null,
      });
    });
  });
});

describe('ficha de la propuesta: decisión de Dirección', () => {
  const inApproval = proposalOf({
    status: 'in_approval',
    step: 'Aprobación de Dirección',
    actions: ['approve', 'reject'],
    can_edit_items: false,
    sent_by: { id: '01999a00-0000-7000-8000-00000000a002', name: 'Carlos Ruiz' },
    sent_at: '2026-10-02T14:00:00.000Z',
  });

  it('aprueba, o rechaza con el motivo; ya no se cambian los documentos', async () => {
    const sent = showProposal(RETENTION_DIRECTOR, inApproval);
    expect(await screen.findByText(/Carlos Ruiz/u)).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Conservar/u })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Falta revisar la serie.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rechazar' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.path.endsWith('/actions/reject'))?.body).toEqual({
        comment: 'Falta revisar la serie.',
      });
    });
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, aprobar' }));
    await vi.waitFor(() => {
      expect(sent.some((r) => r.path.endsWith('/actions/approve'))).toBe(true);
    });
  });
});

describe('ficha de la propuesta: acta', () => {
  it('ejecutada, ofrece descargar el acta', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    const executed = proposalOf({
      status: 'executed',
      actions: [],
      can_edit_items: false,
      has_certificate: true,
      executed_at: '2026-10-03T15:00:00.000Z',
    });
    showProposal(RETENTION_DIRECTOR, executed, {
      [`POST /v1/dispositions/${PROPOSAL_ID}/certificate`]: () =>
        json({
          url: 'http://api.test/v1/files/downloads/acta',
          expires_at: '2026-10-03T15:05:00Z',
        }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Descargar el acta' }));
    await vi.waitFor(() => {
      expect(open).toHaveBeenCalledWith('http://api.test/v1/files/downloads/acta', '_self');
    });
  });
});

describe('retención en la ficha del documento', () => {
  it('muestra la regla, cuándo vence y que entra en la próxima propuesta', async () => {
    serveDocuments(RETENTION_QUALITY, {
      [`GET /v1/documents/${DOCUMENT_ID}/retention-rule`]: () => json(RETENTION_OF_DOCUMENT),
      'GET /v1/retention-rules': () => json({ data: [], unassigned_documents: 0 }),
    });
    renderWithApi(
      <Screen>
        <DocumentDetail id={DOCUMENT_ID} />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('tab', { name: 'Retención' }));
    expect(await screen.findByText('CON-01 · Contratos con clientes')).toBeVisible();
    expect(screen.getByText('15/03/2025')).toBeVisible();
    expect(screen.getByText(/entra en la próxima propuesta/u)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cambiar la regla' })).toBeVisible();
  });

  it('un documento eliminado conserva su ficha sin contenido ni versión nueva', async () => {
    const disposed = documentOf({ status: 'disposed', disposed_at: '2026-10-03T15:00:00.000Z' });
    serveDocuments(RETENTION_QUALITY, {
      [`GET /v1/documents/${DOCUMENT_ID}`]: () => json(disposed),
    });
    renderWithApi(
      <Screen>
        <DocumentDetail id={DOCUMENT_ID} />
      </Screen>,
    );
    expect(await screen.findByText(/se eliminó por disposición final/u)).toBeVisible();
    expect(screen.getByText('Eliminado por disposición')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Nueva versión' })).toBeNull();
  });
});

const HIT = {
  id: DOCUMENT_ID,
  code: 'PR-SGC-001',
  title: 'Control de documentos',
  doc_type: 'PR',
  classification: 'internal',
  status: 'current',
  snippet: 'Procedimiento de [[gestión]] documental',
};

describe('búsqueda global (Ctrl K)', () => {
  it('Ctrl K la abre y busca en documentos y terceros, con lo encontrado resaltado', async () => {
    const sent = serveDocuments(RETENTION_QUALITY, {
      'GET /v1/documents/search': () => json({ data: [HIT] }),
      'GET /v1/parties': () => json({ data: [], next_cursor: null }),
    });
    renderWithApi(
      <Screen>
        <GlobalSearch />
      </Screen>,
    );
    await screen.findByRole('button', { name: /Buscar en todo/u });
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/por lo menos dos letras/u)).toBeVisible();
    await userEvent.type(within(dialog).getByLabelText('Qué busca'), 'gestion');
    expect(await within(dialog).findByRole('link', { name: /PR-SGC-001/u })).toBeVisible();
    expect(within(dialog).getByText('gestión').tagName).toBe('MARK');
    expect(await within(dialog).findByText('Sin resultados.')).toBeVisible();
    expect(sent.find((r) => r.path === '/v1/documents/search')?.search).toContain('q=gestion');
  });

  it('solo busca en lo que la persona puede ver', async () => {
    const sent = serveDocuments(READER, {
      'GET /v1/documents/search': () => json({ data: [] }),
    });
    renderWithApi(
      <Screen>
        <GlobalSearch />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: /Buscar en todo/u }));
    await userEvent.type(screen.getByLabelText('Qué busca'), 'contrato');
    expect(await screen.findByText('Sin resultados.')).toBeVisible();
    expect(screen.queryByText('Terceros')).toBeNull();
    expect(sent.some((r) => r.path === '/v1/parties')).toBe(false);
  });
});
