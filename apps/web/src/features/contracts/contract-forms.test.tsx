import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CLAUSE,
  CONTRACT_DIRECTION,
  CONTRACT_ID,
  CONTRACT_WRITER,
  MODIFIED,
  QUOTE_ID,
  QUOTE_OPTIONS,
  TEMPLATE_ID,
  detailRoute,
  serveContracts,
} from '../../test-support/contract-fixtures';
import { Screen } from '../../test-support/core-fixtures';
import { json, noContent, renderWithApi, type SentRequest } from '../../test-support/fake-api';
import { ClauseLibrary } from './clause-library';
import { EditContract } from './contract-edit';
import { NewContract } from './contract-wizard';

// Asistente, edición del borrador con sus cláusulas y biblioteca de cláusulas (B24).

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push, back: vi.fn() }),
  usePathname: () => '/app/contratos',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

function sentTo(
  sent: readonly SentRequest[],
  method: string,
  path: string,
): SentRequest | undefined {
  return sent.find((request) => request.method === method && request.path === path);
}

describe('asistente del contrato', () => {
  it('desde la cotización aceptada trae los datos, sugiere el firmante y genera el contrato', async () => {
    const sent = serveContracts(CONTRACT_WRITER, {
      'GET /v1/contracts/options': (request) =>
        json(
          request.search.includes('quote_id') ? QUOTE_OPTIONS : { ...QUOTE_OPTIONS, quote: null },
        ),
      'POST /v1/contracts': () => json({ id: CONTRACT_ID }, 201),
    });
    renderWithApi(
      <Screen>
        <NewContract quoteId={QUOTE_ID} />
      </Screen>,
    );
    expect(await screen.findByText(/Desde la cotización aceptada/u)).toBeVisible();
    expect(screen.getByLabelText('Título corto')).toHaveValue('Portal de clientes');
    await userEvent.selectOptions(screen.getByLabelText('Plantilla'), TEMPLATE_ID);
    await userEvent.type(screen.getByLabelText('Inicio'), '2026-11-01');
    await userEvent.type(screen.getByLabelText('Terminación'), '2027-10-31');
    await userEvent.click(await screen.findByRole('button', { name: 'Usar a Laura Gómez' }));
    await userEvent.click(screen.getByRole('button', { name: 'Generar el contrato' }));
    await vi.waitFor(() => {
      expect(sentTo(sent, 'POST', '/v1/contracts')?.body).toMatchObject({
        template_id: TEMPLATE_ID,
        quote_id: QUOTE_ID,
        client_signer_document: 'CC 43000000',
      });
    });
    expect(push).toHaveBeenCalledWith(`/app/contratos/${CONTRACT_ID}`);
  });
});

describe('asistente del contrato', () => {
  it('en blanco no genera nada hasta tener la plantilla y el cliente', async () => {
    const sent = serveContracts(CONTRACT_WRITER);
    renderWithApi(
      <Screen>
        <NewContract quoteId={null} />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Generar el contrato' }));
    expect(
      await screen.findByRole('link', { name: /Plantilla: Elija la plantilla/u }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: /Cliente: Busque y elija el cliente/u })).toBeVisible();
    expect(sentTo(sent, 'POST', '/v1/contracts')).toBeUndefined();
  });
});

/** Abre la edición, restaura la garantía y quita la cláusula penal: ya nada se aparta. */
async function restoreAndRemove(): Promise<void> {
  renderWithApi(
    <Screen>
      <EditContract id={CONTRACT_ID} />
    </Screen>,
  );
  expect(await screen.findByText(/2 cláusulas se apartan/u)).toBeVisible();
  await userEvent.click(
    screen.getByRole('button', { name: 'Restaurar el texto de la biblioteca' }),
  );
  expect(screen.getByText(/Una cláusula se aparta/u)).toBeVisible();
  const penal = screen.getAllByRole('button', { name: 'Quitar esta cláusula' }).at(-1);
  if (penal === undefined) throw new Error('Falta la cláusula penal');
  await userEvent.click(penal);
  expect(screen.queryByText(/se aparta/u)).toBeNull();
}

describe('edición del borrador', () => {
  it('marca la cláusula cambiada, restaura la de la biblioteca, quita y agrega cláusulas', async () => {
    const path = `/v1/contracts/${CONTRACT_ID}`;
    const sent = serveContracts(CONTRACT_WRITER, {
      ...detailRoute(MODIFIED),
      [`PUT ${path}`]: () => noContent(),
    });
    await restoreAndRemove();
    await userEvent.click(screen.getByRole('button', { name: 'Agregar una cláusula nueva' }));
    expect(screen.getByText('Nueva')).toBeVisible();
    await userEvent.type(
      screen.getByLabelText('Título', { selector: '#clausula-2-titulo' }),
      'Penal',
    );
    await userEvent.type(
      screen.getByLabelText('Texto', { selector: '#clausula-2-texto' }),
      'Una pena del 5 % del valor.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar el borrador' }));
    await vi.waitFor(() => {
      expect(sentTo(sent, 'PUT', path)?.body).toMatchObject({
        clauses: [
          { clause_key: 'partes-contrato', body: null },
          { clause_key: 'garantia', body: null },
          { clause_key: null, title: 'Penal' },
        ],
      });
    });
  });
});

describe('edición del borrador', () => {
  it('un contrato que ya no es borrador no se edita', async () => {
    serveContracts(CONTRACT_WRITER, detailRoute({ status: 'approved' }));
    renderWithApi(
      <Screen>
        <EditContract id={CONTRACT_ID} />
      </Screen>,
    );
    expect(await screen.findByText(/ya no es un borrador/u)).toBeVisible();
  });
});

describe('biblioteca de cláusulas', () => {
  it('quien solo lee la consulta sin poder cambiarla', async () => {
    serveContracts(CONTRACT_WRITER);
    renderWithApi(
      <Screen>
        <ClauseLibrary />
      </Screen>,
    );
    expect(await screen.findByText('Por validar por el asesor jurídico')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Agregar una cláusula' })).toBeNull();
  });
});

describe('biblioteca de cláusulas', () => {
  it('la Dirección crea la versión siguiente y agrega una cláusula con su clave', async () => {
    const sent = serveContracts(CONTRACT_DIRECTION, {
      [`POST /v1/contract-clauses/${CLAUSE.key}/versions`]: () => noContent(),
      'POST /v1/contract-clauses': () => noContent(),
    });
    renderWithApi(
      <Screen>
        <ClauseLibrary />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Crear versión nueva' }));
    let dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByLabelText('El asesor jurídico ya validó este texto'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aprobar y guardar' }));
    await vi.waitFor(() => {
      expect(
        sentTo(sent, 'POST', `/v1/contract-clauses/${CLAUSE.key}/versions`)?.body,
      ).toMatchObject({ legal_validated: true });
    });
    await userEvent.click(screen.getByRole('button', { name: 'Agregar una cláusula' }));
    dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aprobar y guardar' }));
    expect(within(dialog).getByRole('alert')).toBeVisible();
    await userEvent.type(within(dialog).getByLabelText('Clave'), 'clausula-penal');
    await userEvent.type(within(dialog).getByLabelText('Título'), 'Cláusula penal');
    await userEvent.type(within(dialog).getByLabelText('Texto'), 'Una pena del 10 % del valor.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aprobar y guardar' }));
    await vi.waitFor(() => {
      expect(sentTo(sent, 'POST', '/v1/contract-clauses')?.body).toMatchObject({
        key: 'clausula-penal',
        numbered: true,
      });
    });
  });
});
