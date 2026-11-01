import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { COMMERCIAL, CRM_READER, LEAD_ID, serveCrm } from '../../test-support/crm-fixtures';
import { json, renderWithApi } from '../../test-support/fake-api';
import { NOTICE_ID, PERSON_ID, PERSON_SUMMARY } from '../../test-support/party-fixtures';
import { LeadForm } from './lead-form';
import { LeadList } from './lead-list';

// Lista y formulario de los prospectos (B22).

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push, back: vi.fn() }),
  usePathname: () => '/app/comercial/prospectos',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

describe('lista de prospectos', () => {
  it('muestra los prospectos y busca con los filtros', async () => {
    const sent = serveCrm(COMMERCIAL);
    renderWithApi(
      <Screen>
        <LeadList />
      </Screen>,
    );
    expect(await screen.findByRole('link', { name: 'Laura Gómez Ríos' })).toBeVisible();
    expect(screen.getByText('LEA-2026-0001 · Andina S.A.S.')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Buscar por código, nombre o empresa'), 'laura');
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'qualified');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await vi.waitFor(() => {
      expect(sent.at(-1)?.search).toBe('?q=laura&status=qualified&limit=25');
    });
  });

  it('sin prospectos y sin permiso de crear no ofrece registrar', async () => {
    serveCrm(CRM_READER, { 'GET /v1/crm/leads': () => json({ data: [], next_cursor: null }) });
    renderWithApi(
      <Screen>
        <LeadList />
      </Screen>,
    );
    expect(await screen.findByText('Todavía no hay prospectos')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Registrar prospecto' })).toBeNull();
  });
});

async function fillPerson(): Promise<void> {
  await userEvent.type(await screen.findByLabelText('Nombres'), 'Laura');
  await userEvent.type(screen.getByLabelText('Apellidos'), 'Gómez Ríos');
  await userEvent.type(screen.getByLabelText('Correo'), 'laura@andina.example');
  await userEvent.type(screen.getByLabelText('¿Qué necesita?'), 'Un portal para sus clientes.');
  await userEvent.selectOptions(await screen.findByLabelText('Origen'), 'WEBSITE');
}

async function acceptConsent(): Promise<void> {
  await userEvent.selectOptions(await screen.findByLabelText('Texto de autorización'), NOTICE_ID);
  await userEvent.click(await screen.findByLabelText('Relación comercial'));
  await userEvent.selectOptions(screen.getByLabelText('Cómo se obtuvo'), 'written');
  await userEvent.type(screen.getByLabelText('Fecha de la autorización'), '2026-10-20');
  await userEvent.click(screen.getByLabelText(/La persona autorizó/u));
}

describe('formulario del prospecto', () => {
  it('no envía sin los datos ni la autorización', async () => {
    const sent = serveCrm(COMMERCIAL);
    renderWithApi(
      <Screen>
        <LeadForm />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar prospecto' }));
    // El resumen enlaza el problema con su campo; el campo también lo muestra.
    expect(
      await screen.findByRole('link', { name: 'Nombres: Escriba los nombres.' }),
    ).toHaveAttribute('href', '#prospecto-nombres');
    expect(screen.getByText('Escriba los nombres.')).toBeVisible();
    expect(sent.some((request) => request.method === 'POST')).toBe(false);
  });

  it('registra la persona nueva con su autorización y abre su ficha', async () => {
    const sent = serveCrm(COMMERCIAL, {
      'POST /v1/crm/leads': () => json({ id: LEAD_ID }, 201),
    });
    renderWithApi(
      <Screen>
        <LeadForm />
      </Screen>,
    );
    await fillPerson();
    await acceptConsent();
    await userEvent.click(screen.getByRole('button', { name: 'Registrar prospecto' }));
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/app/comercial/prospectos/${LEAD_ID}`);
    });
    const post = sent.find((request) => request.method === 'POST');
    expect(post?.body).toMatchObject({
      party_id: null,
      person: { first_name: 'Laura', last_name: 'Gómez Ríos', email: 'laura@andina.example' },
      source: 'WEBSITE',
      consent: { notice_id: NOTICE_ID, accepted: true, purposes: ['COMMERCIAL'] },
    });
  });
});

describe('formulario del prospecto: persona ya registrada', () => {
  it('ofrece usar la persona que ya está en Terceros', async () => {
    const sent = serveCrm(COMMERCIAL, {
      'GET /v1/parties/search': () =>
        json({ data: [{ party: PERSON_SUMMARY, reasons: ['email'] }] }),
    });
    renderWithApi(
      <Screen>
        <LeadForm />
      </Screen>,
    );
    await fillPerson();
    await userEvent.click(await screen.findByRole('button', { name: 'Usar esta persona' }));
    expect(screen.getByText(/Se usará la persona registrada/u)).toBeVisible();
    expect(screen.queryByLabelText('Nombres')).toBeNull();
    expect(sent.some((request) => request.path === '/v1/parties/search')).toBe(true);
    expect(PERSON_ID).toBe(PERSON_SUMMARY.id);
  });
});
