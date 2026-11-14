import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CARE_AGENT,
  OTHER,
  PENDING,
  PQRSF_ID,
  PQRSF_READER,
  pqrsfDetail,
  pqrsfRoute,
  serveCare,
} from '../../test-support/care-fixtures';
import { Screen } from '../../test-support/core-fixtures';
import { apiError, json, noContent, renderWithApi } from '../../test-support/fake-api';
import { PqrsfDetailPanel } from './pqrsf-detail';
import { PqrsfForm } from './pqrsf-form';
import { PqrsfInbox } from './pqrsf-inbox';
import { ServiceHome } from './service-home';

// Pantallas de las PQRSF (B29): bandeja, registro interno y ficha con su recorrido. Datos ficticios.

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push, back: vi.fn() }),
  usePathname: () => '/app/servicio/pqrsf',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

function show(ui: ReactNode): void {
  renderWithApi(<Screen>{ui}</Screen>);
}

describe('bandeja de PQRSF', () => {
  it('lista con su plazo y filtra por vista y tipo', async () => {
    const sent = serveCare(CARE_AGENT);
    show(<PqrsfInbox />);
    expect(await screen.findByRole('link', { name: 'PQRSF-2026-0001' })).toBeVisible();
    expect(screen.getByText('A tiempo')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Registrar una PQRSF' })).toBeVisible();
    const nav = screen.getByRole('navigation', { name: 'Secciones de Servicio al cliente' });
    expect(within(nav).getByRole('link', { name: 'PQRSF' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await userEvent.selectOptions(screen.getByLabelText('Vista'), 'pending_approval');
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'claim');
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    await vi.waitFor(() => {
      expect(sent.some((r) => r.search.includes('view=pending_approval'))).toBe(true);
    });
  });
});

describe('bandeja de PQRSF vacía', () => {
  it('explica qué llega y quien solo lee no registra', async () => {
    serveCare(PQRSF_READER, {
      'GET /v1/pqrsf': () => json({ data: [], next_cursor: null, can_create: false }),
    });
    show(<PqrsfInbox />);
    expect(await screen.findByText('No hay PQRSF en esta vista')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Registrar una PQRSF' })).toBeNull();
  });
});

describe('entrada a Servicio', () => {
  it('quien solo ve PQRSF llega a la bandeja de PQRSF', async () => {
    serveCare(PQRSF_READER);
    show(<ServiceHome />);
    expect(await screen.findByRole('heading', { name: 'PQRSF' })).toBeVisible();
  });
});

describe('registro interno', () => {
  it('pide un correo o un teléfono y abre la ficha al guardar', async () => {
    const sent = serveCare(CARE_AGENT, { 'POST /v1/pqrsf': () => json({ id: PQRSF_ID }, 201) });
    show(<PqrsfForm />);
    const submit = await screen.findByRole('button', { name: 'Registrar la PQRSF' });
    await userEvent.click(submit);
    expect(
      screen.getAllByText('Escriba un correo o un teléfono para responderle.').length,
    ).toBeGreaterThan(0);
    await userEvent.type(screen.getByLabelText('Nombre de quien la presenta'), 'Luis Rojas');
    await userEvent.type(screen.getByLabelText('Teléfono (opcional)'), '3001234567');
    await userEvent.type(screen.getByLabelText('Asunto'), 'Horario de atención');
    await userEvent.type(
      screen.getByLabelText('Qué dice la persona'),
      'Sugiere atender los sábados.',
    );
    await userEvent.click(submit);
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/app/servicio/pqrsf/${PQRSF_ID}`);
    });
    const body = sent.find((r) => r.method === 'POST')?.body;
    expect(body).toMatchObject({ requester_email: null, requester_phone: '3001234567' });
  });
});

describe('ficha: clasificar', () => {
  it('elige responsable y datos personales', async () => {
    const sent = serveCare(CARE_AGENT, {
      [`POST /v1/pqrsf/${PQRSF_ID}/actions/classify`]: () => noContent(),
    });
    show(<PqrsfDetailPanel id={PQRSF_ID} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Clasificar' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Clasificar' }));
    expect(within(dialog).getAllByText('Elija quién la tramita.').length).toBeGreaterThan(0);
    await userEvent.selectOptions(within(dialog).getByLabelText('Responsable'), OTHER.id);
    await userEvent.selectOptions(within(dialog).getByLabelText(/datos personales/u), 'inquiry');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Clasificar' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'POST')?.body).toMatchObject({
        assignee_id: OTHER.id,
        privacy_kind: 'inquiry',
      });
    });
  });
});

describe('ficha: redactar', () => {
  it('una queja pide decir si es procedente', async () => {
    const sent = serveCare(CARE_AGENT, {
      ...pqrsfRoute(
        pqrsfDetail({
          status: 'classified',
          assignee: OTHER,
          can: { classify: true, assign: true, draft: true, approve: false, close: false },
        }),
      ),
      [`POST /v1/pqrsf/${PQRSF_ID}/actions/draft`]: () => noContent(),
    });
    show(<PqrsfDetailPanel id={PQRSF_ID} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Redactar la respuesta' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(
      within(dialog).getByLabelText(/Respuesta para/u),
      'Ajustamos el cronograma.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar la respuesta' }));
    expect(within(dialog).getAllByText('Indique si es procedente.').length).toBeGreaterThan(0);
    await userEvent.selectOptions(within(dialog).getByLabelText(/procedente\?/u), 'true');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar la respuesta' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'POST')?.body).toMatchObject({ well_founded: true });
    });
  });
});

describe('ficha: aprobar', () => {
  it('muestra el borrador por aprobar y lo aprueba', async () => {
    const sent = serveCare(CARE_AGENT, {
      ...pqrsfRoute(PENDING),
      [`POST /v1/pqrsf/${PQRSF_ID}/actions/approve`]: () => noContent(),
    });
    show(<PqrsfDetailPanel id={PQRSF_ID} />);
    expect(await screen.findByText('Ajustamos el cronograma de entregas.')).toBeVisible();
    expect(screen.getByText('Redactó: Tomás Soporte')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar y enviar' }));
    await vi.waitFor(() => {
      expect(sent.some((r) => r.path.endsWith('/actions/approve'))).toBe(true);
    });
  });
});

describe('ficha: devolver', () => {
  it('pide el motivo y lo envía', async () => {
    const sent = serveCare(CARE_AGENT, {
      ...pqrsfRoute(PENDING),
      [`POST /v1/pqrsf/${PQRSF_ID}/actions/return`]: () => noContent(),
    });
    show(<PqrsfDetailPanel id={PQRSF_ID} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Devolver' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Devolver' }));
    expect(within(dialog).getAllByText('Escriba qué hay que corregir.').length).toBeGreaterThan(0);
    await userEvent.type(within(dialog).getByLabelText('Qué hay que corregir'), 'Falta la fecha.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Devolver' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'POST')?.body).toEqual({ reason: 'Falta la fecha.' });
    });
  });
});

describe('ficha: avisos', () => {
  it('dice si venció, si se trasladó, si volvió y si fue a Calidad', async () => {
    serveCare(CARE_AGENT, {
      ...pqrsfRoute(
        pqrsfDetail({
          due_state: 'overdue',
          status: 'in_progress',
          approval: 'returned',
          return_reason: 'Falta la fecha.',
          response_draft: 'Borrador.',
          transferred_at: '2026-11-06T16:00:00.000Z',
          nonconformity_at: '2026-11-06T17:00:00.000Z',
          privacy_kind: 'claim',
          can: { classify: false, assign: false, draft: true, approve: false, close: false },
        }),
      ),
    });
    show(<PqrsfDetailPanel id={PQRSF_ID} />);
    expect(await screen.findByText(/Venció el 27\/11\/2026/u)).toBeVisible();
    expect(screen.getByText(/se trasladó a Privacidad/u)).toBeVisible();
    expect(screen.getByText('La respuesta volvió para corregir: Falta la fecha.')).toBeVisible();
    expect(screen.getByText(/Calidad recibió/u)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Enviar a aprobación' })).toBeVisible();
  });
});

describe('ficha: respondida', () => {
  it('muestra la respuesta enviada y permite cerrar; un error se explica', async () => {
    serveCare(CARE_AGENT, {
      ...pqrsfRoute(
        pqrsfDetail({
          status: 'responded',
          response: 'Ya ajustamos el cronograma.',
          approved_by: OTHER,
          responded_at: '2026-11-07T15:00:00.000Z',
          response_sent_at: '2026-11-07T15:01:00.000Z',
          can: { classify: false, assign: false, draft: false, approve: false, close: true },
        }),
      ),
      [`POST /v1/pqrsf/${PQRSF_ID}/actions/close`]: () =>
        apiError(409, 'VERSION_CONFLICT', 'Otra persona cambió este registro.'),
    });
    show(<PqrsfDetailPanel id={PQRSF_ID} />);
    expect(await screen.findByText('Respuesta enviada')).toBeVisible();
    expect(screen.getByText(/enviada por correo/u)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(await screen.findByText(/Otra persona cambió/u)).toBeVisible();
  });
});
