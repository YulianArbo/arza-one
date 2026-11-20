import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACTIVE,
  AMENDMENT,
  APPROVED,
  CONTRACT_DIRECTION,
  CONTRACT_ID,
  CONTRACT_WRITER,
  MODIFIED,
  OBLIGATION,
  OBLIGATION_ID,
  PDF_FILE_ID,
  detailRoute,
  serveContracts,
} from '../../test-support/contract-fixtures';
import { Screen } from '../../test-support/core-fixtures';
import { noContent, renderWithApi, type SentRequest } from '../../test-support/fake-api';
import { ContractDetailPanel } from './contract-detail';

// Acciones de la ficha del contrato (B24) según su estado y los permisos: pedir la revisión, aprobar
// revisando una por una las modificadas, registrar la firma, prorrogar, terminar y las obligaciones.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/contratos',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ACTIONS = `/v1/contracts/${CONTRACT_ID}/actions`;

function renderDetail(): void {
  renderWithApi(
    <Screen>
      <ContractDetailPanel id={CONTRACT_ID} />
    </Screen>,
  );
}

function posted(sent: readonly SentRequest[], path: string): SentRequest | undefined {
  return sent.find((request) => request.method === 'POST' && request.path === path);
}

describe('borrador', () => {
  it('Comercial lo edita y pide la revisión', async () => {
    const sent = serveContracts(CONTRACT_WRITER, { [`POST ${ACTIONS}/submit`]: () => noContent() });
    renderDetail();
    expect(await screen.findByRole('link', { name: 'Editar' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Pedir la revisión' }));
    await vi.waitFor(() => {
      expect(posted(sent, `${ACTIONS}/submit`)?.headers['If-Match']).toBe('"2"');
    });
  });
});

describe('aprobación de la Dirección', () => {
  it('no aprueba sin marcar cada cláusula modificada; marcadas, envía cuáles revisó', async () => {
    const sent = serveContracts(CONTRACT_DIRECTION, {
      ...detailRoute({ ...MODIFIED, status: 'in_review' }),
      [`POST ${ACTIONS}/approve`]: () => noContent(),
    });
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'Aprobar' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aprobar' }));
    expect(within(dialog).getByText(/Marque cada cláusula/u)).toBeVisible();
    expect(posted(sent, `${ACTIONS}/approve`)).toBeUndefined();
    for (const box of within(dialog).getAllByRole('checkbox')) await userEvent.click(box);
    await userEvent.type(
      within(dialog).getByLabelText('Concepto jurídico (opcional)'),
      'Conforme.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aprobar' }));
    await vi.waitFor(() => {
      expect(posted(sent, `${ACTIONS}/approve`)?.body).toMatchObject({
        reviewed_clause_ids: expect.arrayContaining([
          expect.any(String),
          expect.any(String),
        ]) as unknown,
        legal_note: 'Conforme.',
      });
    });
  });
});

describe('aprobación de la Dirección', () => {
  it('devuelve con un comentario obligatorio', async () => {
    const sent = serveContracts(CONTRACT_DIRECTION, {
      ...detailRoute({ status: 'in_review' }),
      [`POST ${ACTIONS}/return`]: () => noContent(),
    });
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'Devolver para corregir' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Devolver' }));
    expect(within(dialog).getAllByText(/al menos tres letras/u)[0]).toBeVisible();
    await userEvent.type(within(dialog).getByLabelText('Qué debe corregirse'), 'Ajuste el valor.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Devolver' }));
    await vi.waitFor(() => {
      expect(posted(sent, `${ACTIONS}/return`)?.body).toEqual({ comment: 'Ajuste el valor.' });
    });
  });
});

describe('firma manuscrita', () => {
  it('registra la copia firmada en PDF con su fecha', async () => {
    const sent = serveContracts(CONTRACT_WRITER, {
      ...detailRoute(APPROVED),
      [`POST ${ACTIONS}/register-signature`]: () => noContent(),
    });
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar la firma' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    expect(within(dialog).getAllByText('Elija el PDF firmado.')[0]).toBeVisible();
    await userEvent.selectOptions(
      await within(dialog).findByLabelText('Copia firmada (PDF)'),
      PDF_FILE_ID,
    );
    await userEvent.type(within(dialog).getByLabelText('Fecha de la última firma'), '2026-10-30');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    await vi.waitFor(() => {
      expect(posted(sent, `${ACTIONS}/register-signature`)?.body).toEqual({
        file_id: PDF_FILE_ID,
        signed_on: '2026-10-30',
      });
    });
  });
});

describe('contrato vigente', () => {
  it('la Dirección lo prorroga y lo termina con fecha y motivo', async () => {
    const sent = serveContracts(CONTRACT_DIRECTION, {
      ...detailRoute(ACTIVE),
      [`POST ${ACTIONS}/renew`]: () => noContent(),
      [`POST ${ACTIONS}/terminate`]: () => noContent(),
    });
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'Prorrogar' }));
    let dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Nueva fecha de fin'), '2028-10-31');
    await userEvent.type(within(dialog).getByLabelText('Por qué se prorroga'), 'Renueva un año.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Prorrogar' }));
    await vi.waitFor(() => {
      expect(posted(sent, `${ACTIONS}/renew`)?.body).toEqual({
        new_ends_on: '2028-10-31',
        summary: 'Renueva un año.',
      });
    });
    await userEvent.click(screen.getByRole('button', { name: 'Terminar' }));
    dialog = await screen.findByRole('dialog');
    await userEvent.type(
      within(dialog).getByLabelText('Para confirmar, escriba el código CTR-2026-0001'),
      'CTR-2026-0001',
    );
    await userEvent.type(within(dialog).getByLabelText('Fecha de terminación'), '2026-12-01');
    await userEvent.type(
      within(dialog).getByLabelText('Motivo de la terminación'),
      'Mutuo acuerdo.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Terminar' }));
    await vi.waitFor(() => {
      expect(posted(sent, `${ACTIONS}/terminate`)?.body).toEqual({
        terminated_on: '2026-12-01',
        reason: 'Mutuo acuerdo.',
      });
    });
  });
});

describe('contrato vigente', () => {
  it('registra una obligación a su cargo y la marca cumplida', async () => {
    const base = `/v1/contracts/${CONTRACT_ID}/obligations`;
    const sent = serveContracts(CONTRACT_WRITER, {
      ...detailRoute({ ...ACTIVE, obligations: [OBLIGATION] }),
      [`POST ${base}`]: () => noContent(),
      [`POST ${base}/${OBLIGATION_ID}/actions/complete`]: () => noContent(),
    });
    renderDetail();
    await userEvent.click(await screen.findByRole('tab', { name: 'Obligaciones' }));
    await userEvent.click(screen.getByRole('button', { name: 'Marcar cumplida' }));
    await userEvent.click(screen.getByRole('button', { name: 'Registrar una obligación' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(
      within(dialog).getByLabelText('Obligación o hito'),
      'Entregar los accesos',
    );
    await userEvent.type(
      within(dialog).getByLabelText('Fecha en que debe cumplirse'),
      '2026-11-20',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    await vi.waitFor(() => {
      expect(posted(sent, base)?.body).toMatchObject({
        description: 'Entregar los accesos',
        due_on: '2026-11-20',
      });
    });
    expect(posted(sent, `${base}/${OBLIGATION_ID}/actions/complete`)?.headers['If-Match']).toBe(
      '"1"',
    );
  });
});

describe('otrosíes', () => {
  it('la Dirección aprueba el otrosí en revisión', async () => {
    const path = `/v1/contracts/${CONTRACT_ID}/amendments/${AMENDMENT.id}/actions/approve`;
    const sent = serveContracts(CONTRACT_DIRECTION, {
      ...detailRoute({ ...ACTIVE, amendments: [AMENDMENT] }),
      [`POST ${path}`]: () => noContent(),
    });
    renderDetail();
    await userEvent.click(await screen.findByRole('tab', { name: 'Otrosíes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    await vi.waitFor(() => {
      expect(posted(sent, path)?.headers['If-Match']).toBe('"2"');
    });
  });
});

describe('otrosíes', () => {
  it('Comercial propone un otrosí y debe escribir qué cambia', async () => {
    const path = `/v1/contracts/${CONTRACT_ID}/amendments`;
    const sent = serveContracts(CONTRACT_WRITER, {
      ...detailRoute(ACTIVE),
      [`POST ${path}`]: () => noContent(),
    });
    renderDetail();
    await userEvent.click(await screen.findByRole('tab', { name: 'Otrosíes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Proponer un otrosí' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar a la Dirección' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Escriba qué cambia');
    await userEvent.type(within(dialog).getByLabelText('Qué cambia, en una línea'), 'Más alcance');
    await userEvent.type(
      within(dialog).getByLabelText('Texto del otrosí'),
      'Se incluye el módulo de pagos.',
    );
    await userEvent.type(within(dialog).getByLabelText('Desde cuándo rige'), '2026-11-01');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar a la Dirección' }));
    await vi.waitFor(() => {
      expect(posted(sent, path)?.body).toMatchObject({
        summary: 'Más alcance',
        new_ends_on: null,
        new_value: null,
      });
    });
  });
});

describe('otrosíes ya decididos', () => {
  it('uno firmado muestra la nota, el texto sin cambios de fechas y sus dos copias', async () => {
    const signed = {
      ...AMENDMENT,
      status: 'signed',
      new_ends_on: null,
      new_value: null,
      decision_note: 'Conforme con el alcance.',
      pdf_ready: true,
      signed_on: '2026-11-03',
    };
    serveContracts(CONTRACT_WRITER, detailRoute({ ...ACTIVE, amendments: [signed] }));
    renderDetail();
    await userEvent.click(await screen.findByRole('tab', { name: 'Otrosíes' }));
    expect(
      await screen.findByText('Nota de la Dirección: «Conforme con el alcance.»'),
    ).toBeVisible();
    expect(screen.getByText('Rige desde 01/11/2026')).toBeVisible();
    expect(screen.getByRole('button', { name: 'PDF' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Copia firmada' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull();
  });
});
