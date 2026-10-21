import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DOCUMENT_ID, serveDocuments } from '../../test-support/doc-fixtures';
import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import { Screen } from '../../test-support/privacy-fixtures';
import {
  PROPOSAL_ID,
  RETENTION_DIRECTOR,
  RETENTION_QUALITY,
  RULE_ID,
  proposalOf,
  ruleOf,
} from '../../test-support/retention-fixtures';
import { DispositionList } from './dispositions';
import { RetentionRules } from './retention-rules';

// Tabla de retención, disposición final y retención del documento (B21).

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push, back: vi.fn() }),
  usePathname: () => '/app/documentos/retencion',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  push.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const RULES = { data: [ruleOf()], unassigned_documents: 2 };
const UNASSIGNED = {
  data: [{ id: DOCUMENT_ID, code: 'IN-SGC-001', title: 'Instructivo', doc_type: 'IN' }],
  total: 2,
};

function serveRules(extra = {}) {
  return serveDocuments(RETENTION_QUALITY, {
    'GET /v1/retention-rules': () => json(RULES),
    'GET /v1/retention-rules/unassigned-documents': () => json(UNASSIGNED),
    ...extra,
  });
}

describe('tabla de retención', () => {
  it('muestra cada serie con sus años y cuántos documentos no tienen regla', async () => {
    serveRules();
    renderWithApi(
      <Screen>
        <RetentionRules />
      </Screen>,
    );
    expect(await screen.findByText('CON-01')).toBeVisible();
    expect(screen.getByText('2 años en gestión y 8 en el archivo central')).toBeVisible();
    expect(screen.getByText('Eliminar')).toBeVisible();
    await userEvent.click(screen.getByText(/2 documentos no tienen regla/u));
    expect(await screen.findByRole('link', { name: 'IN-SGC-001' })).toBeVisible();
  });
});

describe('tabla de retención: reglas nuevas', () => {
  it('agrega una regla con el código en mayúsculas', async () => {
    const sent = serveRules({ 'POST /v1/retention-rules': () => json({ id: RULE_ID }, 201) });
    renderWithApi(
      <Screen>
        <RetentionRules />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Agregar una regla' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Código de la serie'), 'pro-01');
    await userEvent.type(within(dialog).getByLabelText('Serie documental'), 'Procedimientos');
    await userEvent.selectOptions(within(dialog).getByLabelText('Tipo de documento'), 'PR');
    await userEvent.type(within(dialog).getByLabelText('Fundamento'), 'PR-SGC-001');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'POST')?.body).toEqual({
        code: 'PRO-01',
        name: 'Procedimientos',
        doc_type: 'PR',
        process_id: null,
        active_years: 2,
        archive_years: 8,
        disposition: 'destroy',
        legal_basis: 'PR-SGC-001',
      });
    });
  });
});

describe('tabla de retención: cambios', () => {
  it('desactiva una regla con la versión vista', async () => {
    const sent = serveRules({ [`PUT /v1/retention-rules/${RULE_ID}`]: () => noContent() });
    renderWithApi(
      <Screen>
        <RetentionRules />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, desactivar' }));
    await vi.waitFor(() => {
      const put = sent.find((r) => r.method === 'PUT');
      expect(put?.body).toMatchObject({ is_active: false, name: 'Contratos con clientes' });
      expect(put?.headers['If-Match']).toBe('"1"');
    });
  });

  it('sin reglas explica cómo cargarlas; sin documentos pendientes lo dice', async () => {
    serveRules({
      'GET /v1/retention-rules': () => json({ data: [], unassigned_documents: 0 }),
    });
    renderWithApi(
      <Screen>
        <RetentionRules />
      </Screen>,
    );
    expect(await screen.findByText('Todavía no hay reglas de retención')).toBeVisible();
    expect(screen.getByText('Todos los documentos tienen su regla de retención.')).toBeVisible();
  });
});

describe('disposición final: propuestas', () => {
  it('lista las propuestas y genera la del mes', async () => {
    serveDocuments(RETENTION_QUALITY, {
      'GET /v1/dispositions': () => json({ data: [proposalOf()], next_cursor: null }),
      'POST /v1/dispositions/propose': () => json({ proposal_id: PROPOSAL_ID, created: true }),
    });
    renderWithApi(
      <Screen>
        <DispositionList />
      </Screen>,
    );
    expect(await screen.findByRole('link', { name: 'DIS-2026-0001' })).toBeVisible();
    expect(screen.getByText('1 para eliminar · 1 para conservar')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Generar la propuesta del mes' }));
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/app/documentos/disposicion/${PROPOSAL_ID}`);
    });
  });
});

describe('disposición final: sin propuestas', () => {
  it('sin vencidos dice que no hay nada que proponer; Dirección no la genera', async () => {
    serveDocuments(RETENTION_QUALITY, {
      'GET /v1/dispositions': () => json({ data: [], next_cursor: null }),
      'POST /v1/dispositions/propose': () => json({ proposal_id: null, created: false }),
    });
    const view = renderWithApi(
      <Screen>
        <DispositionList />
      </Screen>,
    );
    expect(await screen.findByText('No hay propuestas de disposición')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Generar la propuesta del mes' }));
    expect(await screen.findByText(/no hay nada que proponer/u)).toBeVisible();
    view.unmount();
    serveDocuments(RETENTION_DIRECTOR, {
      'GET /v1/dispositions': () => json({ data: [], next_cursor: null }),
    });
    renderWithApi(
      <Screen>
        <DispositionList />
      </Screen>,
    );
    expect(await screen.findByText('No hay propuestas de disposición')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Generar la propuesta del mes' })).toBeNull();
  });
});
