import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { json, mockApi, renderWithApi } from '../../test-support/fake-api';
import { PortalCompany } from './portal-company';

// Empresa cliente en el encabezado del portal (B22A).

const COMPANY = { id: '01999a00-0000-7000-8000-0000000f0001', name: 'Demo Uno S.A.S.' };

beforeEach(() => {
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:logo', revokeObjectURL: vi.fn() }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('empresa del portal', () => {
  it('muestra el nombre y el logo de la empresa de la persona', async () => {
    mockApi({
      'GET /v1/me/company': () => json({ company: { ...COMPANY, has_logo: true } }),
      'GET /v1/me/company/logo': () => new Response('png'),
    });
    renderWithApi(<PortalCompany />);
    expect(await screen.findByText('Demo Uno S.A.S.')).toBeVisible();
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Demo Uno S.A.S.' })).toHaveAttribute(
        'src',
        'blob:logo',
      );
    });
  });

  it('sin logo muestra las iniciales y sin empresa no muestra nada', async () => {
    mockApi({ 'GET /v1/me/company': () => json({ company: { ...COMPANY, has_logo: false } }) });
    const { unmount } = renderWithApi(<PortalCompany />);
    expect(await screen.findByText('DU')).toBeVisible();
    unmount();
    const sent = mockApi({ 'GET /v1/me/company': () => json({ company: null }) });
    const { container } = renderWithApi(<PortalCompany />);
    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(container).toBeEmptyDOMElement();
  });
});
