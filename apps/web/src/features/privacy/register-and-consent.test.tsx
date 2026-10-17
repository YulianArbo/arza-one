import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { json, renderWithApi } from '../../test-support/fake-api';
import {
  ACTIVITIES,
  ACTIVITY_ID,
  OFFICER,
  ORG_ID,
  PROCESSORS,
  Screen,
  servePrivacy,
} from '../../test-support/privacy-fixtures';
import { ActivitiesPanel } from './activities-panel';
import { EMPTY_CONSENT, consentBody, consentErrors } from './consent-values';
import { ProcessorsPanel } from './processors-panel';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/privacidad',
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

function render(ui: ReactNode): void {
  renderWithApi(<Screen>{ui}</Screen>);
}

describe('valores del componente de autorización', () => {
  it('sin la casilla marcada no hay autorización, y el soporte es opcional', () => {
    expect(consentErrors(EMPTY_CONSENT)['accepted']).toBe(
      'Marque la casilla de autorización para continuar.',
    );
    const filled = {
      noticeId: '01999a00-0000-7000-8000-00000000d001',
      accepted: true,
      purposes: ['COMMERCIAL'],
      channel: 'digital' as const,
      grantedOn: '2026-10-16',
      evidenceFileId: '',
    };
    expect(consentErrors(filled)).toEqual({});
    expect(consentBody(filled)['evidence_file_id']).toBeNull();
    expect(consentErrors({ ...filled, purposes: [] })['purposes']).toBe(
      'Elija al menos una finalidad autorizada.',
    );
  });
});

describe('actividades de tratamiento', () => {
  it('marca los datos sensibles y edita con la versión vista', async () => {
    const sent = servePrivacy(OFFICER, {
      [`PATCH /v1/processing-activities/${ACTIVITY_ID}`]: () =>
        json({ ...ACTIVITIES.data[0], retention: 'Cinco años', version: 4 }),
    });
    render(<ActivitiesPanel />);
    expect(await screen.findByText('Datos sensibles')).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: 'Editar la actividad Gestión de clientes' }),
    );
    const dialog = await screen.findByRole('dialog');
    const retention = within(dialog).getByLabelText('Tiempo de conservación');
    await userEvent.clear(retention);
    await userEvent.type(retention, 'Cinco años');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      const patch = sent.find((request) => request.method === 'PATCH');
      expect(patch?.headers).toMatchObject({ 'If-Match': '"3"' });
      expect(patch?.body).toMatchObject({ retention: 'Cinco años', status: 'active' });
    });
  });
});

describe('actividades de tratamiento: validación', () => {
  it('no envía una actividad sin categorías ni titulares', async () => {
    const sent = servePrivacy(OFFICER);
    render(<ActivitiesPanel />);
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar actividad' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Selección');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialog).findByText('Elija al menos una categoría de datos.')).toBeVisible();
    expect(within(dialog).getByText('Elija al menos un tipo de titular.')).toBeVisible();
    expect(sent.some((request) => request.method === 'POST')).toBe(false);
  });
});

describe('encargados', () => {
  it('alerta la falta de contrato y registra un encargado', async () => {
    const sent = servePrivacy(OFFICER, {
      'POST /v1/processors': () => json({ id: PROCESSORS.data[0]?.id }, 201),
    });
    render(<ProcessorsPanel />);
    expect(await screen.findByText('Falta contrato de transmisión')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Registrar encargado' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(await within(dialog).findByLabelText('Organización'), ORG_ID);
    await userEvent.type(
      within(dialog).getByLabelText('Servicio que presta con los datos'),
      'Correo',
    );
    await userEvent.type(within(dialog).getByLabelText('Próxima revisión'), '2027-03-31');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.method === 'POST')?.body).toEqual({
        party_id: ORG_ID,
        service: 'Correo',
        country: 'CO',
        contract_file_id: null,
        review_on: '2027-03-31',
      });
    });
  });
});
