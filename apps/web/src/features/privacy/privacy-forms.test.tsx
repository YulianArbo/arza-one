import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiError, json, renderWithApi } from '../../test-support/fake-api';
import {
  PROCESSORS,
  OFFICER,
  Screen,
  consent,
  notice,
  servePrivacy,
} from '../../test-support/privacy-fixtures';
import { ActivitiesPanel } from './activities-panel';
import { ConsentsPanel } from './consents-panel';
import { NoticesPanel } from './notices-panel';
import { ProcessorsPanel } from './processors-panel';

// Casos de los formularios de privacidad (B17): versiones nuevas, edición de encargados,
// autorizaciones revocadas y actividades con encargados y transferencias.

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

const LONG_BODY =
  'Texto nuevo de la política de tratamiento con la extensión que pide la plataforma.';

describe('versión nueva de un texto', () => {
  it('parte del texto vigente y crea el borrador de la clase', async () => {
    const policy = notice({ key: 'privacy_policy', label: 'Política', purposes: [] });
    const sent = servePrivacy(OFFICER, {
      'GET /v1/notices': () => json({ data: [policy] }),
      'POST /v1/notices': () => json({ id: policy['id'] }, 201),
    });
    render(<NoticesPanel />);
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Nueva versión de Política de tratamiento de datos personales',
      }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Título')).toHaveValue('Autorización de clientes 2026');
    expect(within(dialog).queryByText('Finalidades que ofrece')).toBeNull();
    const body = within(dialog).getByLabelText('Texto completo');
    await userEvent.clear(body);
    await userEvent.type(body, LONG_BODY);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar borrador' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.method === 'POST')?.body).toMatchObject({
        key: 'privacy_policy',
        body: LONG_BODY,
        purposes: [],
      });
    });
  });
});

describe('versión nueva de una autorización', () => {
  it('exige al menos una finalidad y muestra el error de la API', async () => {
    const sent = servePrivacy(OFFICER, {
      'GET /v1/notices': () => json({ data: [] }),
      'POST /v1/notices': () => apiError(422, 'PRIVACY_PURPOSE_INVALID', 'Finalidad inactiva.'),
    });
    render(<NoticesPanel />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Nueva versión de Autorización de clientes' }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Título'), 'Clientes');
    await userEvent.type(within(dialog).getByLabelText('Texto completo'), LONG_BODY);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar borrador' }));
    expect(
      await within(dialog).findByText('Elija al menos una finalidad que el titular pueda aceptar.'),
    ).toBeVisible();
    await userEvent.click(within(dialog).getByLabelText('Relación comercial'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar borrador' }));
    expect(await within(dialog).findByText('Finalidad inactiva.')).toBeVisible();
    expect(sent.find((request) => request.method === 'POST')?.body).toMatchObject({
      purposes: ['COMMERCIAL'],
    });
  });
});

describe('editar un encargado', () => {
  it('lo inactiva con la versión vista y valida el país', async () => {
    const processor = PROCESSORS.data[0];
    const sent = servePrivacy(OFFICER, {
      [`PATCH /v1/processors/${processor?.id ?? ''}`]: () =>
        json({ ...processor, status: 'inactive', version: 2 }),
    });
    render(<ProcessorsPanel />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Editar el encargado Nube Andina S.A.S.' }),
    );
    const dialog = await screen.findByRole('dialog');
    const country = within(dialog).getByLabelText('País donde trata los datos');
    await userEvent.clear(country);
    await userEvent.type(country, 'X');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(
      await within(dialog).findByText('Use el código de dos letras del país, como CO o US.'),
    ).toBeVisible();
    await userEvent.type(country, 'X');
    await userEvent.click(within(dialog).getByLabelText('Activo'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      const patch = sent.find((request) => request.method === 'PATCH');
      expect(patch?.headers).toMatchObject({ 'If-Match': '"1"' });
      expect(patch?.body).toMatchObject({ country: 'XX', status: 'inactive' });
    });
  });
});

describe('autorización revocada', () => {
  it('muestra la revocatoria sin ofrecer revocar de nuevo', async () => {
    const revoked = consent({
      status: 'revoked',
      revoked_at: '2026-10-16T15:00:00.000Z',
      revocation_reason: 'Lo pidió el titular',
      party: { id: '01999a00-0000-7000-8000-00000000d402', name: null },
      evidence: {
        recorded_by: null,
        recorded_at: '2026-10-01T15:00:00.000Z',
        ip_address: null,
        user_agent: null,
        file_id: null,
      },
    });
    servePrivacy(OFFICER, {
      'GET /v1/consents': () => json({ data: [revoked], next_cursor: revoked['id'] }),
    });
    render(<ConsentsPanel />);
    expect(await screen.findByText('Titular retirado')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Ver la evidencia de la autorización de Titular retirado',
      }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Lo pidió el titular')).toBeVisible();
    expect(within(dialog).getByText('El sistema')).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: 'Revocar' })).toBeNull();
  });
});

describe('actividad con encargados y transferencias', () => {
  it('envía los encargados elegidos y las transferencias', async () => {
    const sent = servePrivacy(OFFICER, {
      'POST /v1/processing-activities': () => json({ id: PROCESSORS.data[0]?.id }, 201),
    });
    render(<ActivitiesPanel />);
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar actividad' }));
    const dialog = await screen.findByRole('dialog');
    const fill = async (label: string, text: string) => {
      await userEvent.type(within(dialog).getByLabelText(label), text);
    };
    await fill('Nombre', 'Nómina');
    await fill('Finalidad', 'Pagar la nómina a los colaboradores');
    await fill('Fundamento legal', 'Contrato de trabajo (Código Sustantivo)');
    await fill('Tiempo de conservación', 'Ochenta años');
    await fill('Transferencias internacionales (opcional)', 'Estados Unidos, nube');
    await userEvent.click(within(dialog).getByLabelText('Laborales'));
    await userEvent.click(within(dialog).getByLabelText('Financieros'));
    await userEvent.click(within(dialog).getByLabelText('Financieros'));
    await userEvent.click(within(dialog).getByLabelText('Colaboradores'));
    await userEvent.click(await within(dialog).findByLabelText('Nube Andina S.A.S.'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.method === 'POST')?.body).toMatchObject({
        data_categories: ['employment'],
        holder_types: ['employees'],
        international_transfers: 'Estados Unidos, nube',
        processor_ids: [PROCESSORS.data[0]?.id],
      });
    });
  });
});
