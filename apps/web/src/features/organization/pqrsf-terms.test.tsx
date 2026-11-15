import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CORE_ADMIN, Screen, serveCore } from '../../test-support/core-fixtures';
import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import { ParametersPanel, describeValue } from './parameters-panel';

// Plazos de respuesta de PQRSF (B29, decisión 2) en Administración › Parámetros: se muestran en
// palabras y se programan como cualquier parámetro con vigencia.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/administracion/parametros',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const TERMS = {
  petition: 15,
  complaint: 15,
  claim: 15,
  suggestion: 30,
  compliment: 30,
  privacy_inquiry: 10,
  privacy_claim: 15,
};

const VERSION = {
  id: '01999a00-0000-7000-8000-0000000d0101',
  value: TERMS,
  valid_from: '2026-01-01',
  valid_to: null,
  created_at: '2026-01-01T05:00:00.000Z',
  created_by: null,
};

const PARAMETER = {
  key: 'service.pqrsf_terms',
  label: 'Plazos de respuesta de PQRSF',
  description: 'Días hábiles para responder cada tipo de PQRSF.',
  current: VERSION,
  scheduled: null,
};

describe('plazos de PQRSF en palabras', () => {
  it('lista cada tipo con sus días hábiles', () => {
    const text = describeValue(TERMS);
    expect(text).toContain('Petición: 15');
    expect(text).toContain('Consulta sobre datos personales: 10');
    expect(text).toMatch(/días hábiles\.$/u);
  });
});

describe('programar plazos nuevos', () => {
  it('avisa si un plazo no es válido y guarda los números', async () => {
    const sent = serveCore(CORE_ADMIN, {
      'GET /v1/parameters': () => json({ data: [PARAMETER] }),
      'POST /v1/parameters/service.pqrsf_terms/versions': () => noContent(),
    });
    renderWithApi(
      <Screen>
        <ParametersPanel />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Programar un cambio' }));
    const dialog = await screen.findByRole('dialog');
    const petition = within(dialog).getByLabelText('Petición (días hábiles)');
    await userEvent.clear(petition);
    await userEvent.type(petition, '0');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Programar el cambio' }));
    expect(within(dialog).getByText('El plazo es de al menos un día hábil.')).toBeVisible();
    await userEvent.clear(petition);
    await userEvent.type(petition, '10');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Programar el cambio' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'POST')?.body).toMatchObject({
        value: { ...TERMS, petition: 10 },
      });
    });
  });
});
