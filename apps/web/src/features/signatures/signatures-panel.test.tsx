import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  APPROVED,
  CONTRACT_ID,
  detailRoute,
  serveContracts,
} from '../../test-support/contract-fixtures';
import { Screen } from '../../test-support/core-fixtures';
import { json, noContent, renderWithApi, type SentRequest } from '../../test-support/fake-api';
import {
  CLIENT_SIGNER_ID,
  COMPANY_TURN,
  COMPANY_TURN_SIGNERS,
  COMPLETED,
  ENVELOPE_ID,
  ENVELOPE_OPTIONS,
  SIGNATURE_DIRECTION,
  SIGNATURE_SALES,
  envelope,
} from '../../test-support/signature-fixtures';
import { ContractDetailPanel } from '../contracts/contract-detail';

// La pestaña Firmas de la ficha del contrato (B25): preparar el envío, enviarlo (la Dirección, con
// una llave contra envíos repetidos), firmar por la empresa y ver el documento firmado.

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

const ENVELOPES = '/v1/signature-envelopes';

function serve(permissions: object, envelopes: readonly object[], extra = {}): SentRequest[] {
  return serveContracts(permissions, {
    ...detailRoute(APPROVED),
    [`GET ${ENVELOPES}`]: () => json({ items: envelopes }),
    [`GET ${ENVELOPES}/options`]: () => json(ENVELOPE_OPTIONS),
    ...extra,
  });
}

async function openTab(): Promise<void> {
  renderWithApi(
    <Screen>
      <ContractDetailPanel id={CONTRACT_ID} />
    </Screen>,
  );
  await userEvent.click(await screen.findByRole('tab', { name: 'Firmas' }));
}

function posted(sent: readonly SentRequest[], path: string): SentRequest | undefined {
  return sent.find((request) => request.method === 'POST' && request.path === path);
}

describe('preparar el envío a firma', () => {
  it('Comercial elige los firmantes autorizados en orden, quién firma por la empresa y el plazo', async () => {
    const sent = serve(SIGNATURE_SALES, [], {
      [`POST ${ENVELOPES}`]: () => json({ id: ENVELOPE_ID }, 201),
    });
    await openTab();
    await userEvent.click(await screen.findByRole('button', { name: 'Preparar el envío a firma' }));
    expect(await screen.findByLabelText(/Pedro Sin Correo/u)).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Preparar el envío' }));
    // En el resumen de errores y junto a la lista de firmantes.
    expect(await screen.findAllByText(/Marque al menos una persona/u)).toHaveLength(2);
    await userEvent.click(screen.getByLabelText(/Laura Gómez/u));
    expect(screen.getByText(/firma de 1\.º/u)).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText(/Firma por la empresa/u), 'Diego Director');
    await userEvent.click(screen.getByRole('button', { name: 'Preparar el envío' }));
    await vi.waitFor(() => {
      expect(posted(sent, ENVELOPES)?.body).toMatchObject({
        source: 'contract',
        source_id: CONTRACT_ID,
        client_signer_ids: [ENVELOPE_OPTIONS.client_signers[0]?.person_id],
        expires_on: '2026-11-14',
        message: null,
      });
    });
  });

  it('sin el conocimiento del cliente aprobado, explica por qué no se puede', async () => {
    serve(SIGNATURE_SALES, [], {
      [`GET ${ENVELOPES}/options`]: () => json({ ...ENVELOPE_OPTIONS, party_verified: false }),
    });
    await openTab();
    await userEvent.click(await screen.findByRole('button', { name: 'Preparar el envío a firma' }));
    expect(await screen.findByText(/debe estar aprobado en Terceros/u)).toBeVisible();
  });
});

describe('enviar y seguir la firma', () => {
  it('la Dirección envía con la versión y una llave de operación', async () => {
    const path = `${ENVELOPES}/${ENVELOPE_ID}/actions/send`;
    const sent = serve(SIGNATURE_DIRECTION, [envelope()], { [`POST ${path}`]: () => noContent() });
    await openTab();
    expect(await screen.findByText('Cadena de eventos intacta')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Preparar el envío a firma' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar a firma' }));
    await vi.waitFor(() => {
      const request = posted(sent, path);
      expect(request?.headers['If-Match']).toBe('"1"');
      expect(request?.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/u);
    });
  });

  it('Comercial ve el proceso, pero no lo envía ni lo anula', async () => {
    serve(SIGNATURE_SALES, [envelope()]);
    await openTab();
    expect(await screen.findByText('FE-2026-0001')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Enviar a firma' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Anular' })).toBeNull();
  });
});

describe('firmar por la empresa', () => {
  it('la persona elegida marca la aceptación y firma', async () => {
    const path = `${ENVELOPES}/${ENVELOPE_ID}/actions/sign`;
    const sent = serve(SIGNATURE_DIRECTION, [envelope(COMPANY_TURN, COMPANY_TURN_SIGNERS)], {
      [`POST ${path}`]: () => noContent(),
    });
    await openTab();
    expect(screen.queryByRole('button', { name: `Reenviar el enlace a Laura Gómez` })).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: 'Firmar por la empresa' }));
    await userEvent.click(screen.getByRole('button', { name: 'Firmar' }));
    expect(await screen.findByText('Marque la casilla para firmar.')).toBeVisible();
    await userEvent.click(screen.getByLabelText(/He leído y acepto/u));
    await userEvent.click(screen.getByRole('button', { name: 'Firmar' }));
    await vi.waitFor(() => {
      expect(posted(sent, path)?.body).toEqual({ accept: true });
    });
  });

  it('reenviar el enlace a quien le toca, si el código se bloqueó', async () => {
    const path = `${ENVELOPES}/${ENVELOPE_ID}/signers/${CLIENT_SIGNER_ID}/actions/resend`;
    const locked = { status: 'pending', code_locked: true };
    const signers = [
      { ...(COMPANY_TURN_SIGNERS[0] ?? {}), ...locked },
      COMPANY_TURN_SIGNERS[1] ?? {},
    ];
    const sent = serve(SIGNATURE_DIRECTION, [envelope(COMPANY_TURN, signers)], {
      [`POST ${path}`]: () => noContent(),
    });
    await openTab();
    expect(await screen.findByText('Código bloqueado')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Reenviar el enlace a Laura Gómez' }));
    await vi.waitFor(() => {
      expect(posted(sent, path)).toBeDefined();
    });
  });
});

describe('documento firmado', () => {
  it('muestra el código de verificación y ofrece el firmado y el certificado', async () => {
    serve(SIGNATURE_SALES, [envelope(COMPLETED)]);
    await openTab();
    expect(await screen.findByText(/Código de verificación: ABCD-EFGH-JKLM/u)).toBeVisible();
    expect(screen.getByRole('button', { name: 'PDF firmado' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Certificado de evidencia' })).toBeVisible();
  });
});

// El cliente rechazó: el evento trae su nombre y no su dirección.
const REJECTED = {
  status: 'rejected',
  closed_reason: 'El cliente rechazó la firma.',
  chain_intact: false,
  events: [
    {
      id: '01999a00-0000-7000-8000-0000000e0302',
      type: 'created',
      signer_name: 'Laura Gómez',
      occurred_at: '2026-10-30T16:00:00.000Z',
      ip: null,
      user_agent: null,
      hash: 'e'.repeat(64),
    },
  ],
};

const REJECTED_SIGNERS = [
  {
    ...(COMPANY_TURN_SIGNERS[0] ?? {}),
    status: 'rejected',
    signed_at: null,
    rejected_at: '2026-10-30T16:00:00.000Z',
    reject_reason: 'El valor no es el acordado.',
  },
  COMPANY_TURN_SIGNERS[1] ?? {},
];

describe('procesos cerrados o en preparación del firmado', () => {
  it('un rechazo muestra el motivo, quién rechazó y si la cadena cambió', async () => {
    serve(SIGNATURE_SALES, [envelope(REJECTED, REJECTED_SIGNERS)]);
    await openTab();
    expect(await screen.findByText('El cliente rechazó la firma.')).toBeVisible();
    expect(screen.getByText('La cadena de eventos cambió')).toBeVisible();
    expect(screen.getByText('El valor no es el acordado.')).toBeVisible();
    expect(screen.getByText(/· Laura Gómez$/u)).toBeInTheDocument();
  });

  it('firmado por todos, avisa mientras se prepara el documento firmado', async () => {
    serve(SIGNATURE_SALES, [envelope({ ...COMPLETED, signed: null })]);
    await openTab();
    expect(await screen.findByText(/Preparando el documento firmado/u)).toBeVisible();
  });

  it('en firma, dice hasta cuándo y en qué orden', async () => {
    serve(SIGNATURE_SALES, [envelope(COMPANY_TURN, COMPANY_TURN_SIGNERS)]);
    await openTab();
    expect(await screen.findByText(/Firman en orden; la empresa, de última/u)).toBeVisible();
  });
});
