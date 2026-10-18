import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { json, renderWithApi } from '../../test-support/fake-api';
import { FORM_READER, serveForms } from '../../test-support/form-fixtures';
import { Screen } from '../../test-support/privacy-fixtures';
import { RecordList } from './record-list';

// Lista de los registros diligenciados (B20): código, formato y estado, con filtros.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/documentos/registros',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('lista de registros', () => {
  it('muestra código, formato y estado; filtra por formato y estado', async () => {
    const sent = serveForms(FORM_READER);
    renderWithApi(
      <Screen>
        <RecordList />
      </Screen>,
    );
    expect(await screen.findByRole('link', { name: 'FT-COM-002-2026-0001' })).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'completed');
    await userEvent.selectOptions(await screen.findByLabelText('Formato'), 'FT-COM-002');
    await vi.waitFor(() => {
      expect(
        sent.some(
          (r) =>
            r.search.includes('template_code=FT-COM-002') && r.search.includes('status=completed'),
        ),
      ).toBe(true);
    });
  });
});

describe('lista de registros', () => {
  it('sin registros explica cómo empezar', async () => {
    serveForms(FORM_READER, {
      'GET /v1/form-records': () => json({ data: [], next_cursor: null }),
    });
    renderWithApi(
      <Screen>
        <RecordList />
      </Screen>,
    );
    expect(await screen.findByText('No hay registros')).toBeVisible();
  });
});
