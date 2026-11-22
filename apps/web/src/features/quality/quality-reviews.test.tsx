import type { PermissionCode } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { json, mockApi, noContent, SESSION, type SentRequest } from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { openDialog, sentTo, show } from '../sst/sst-test-support';
import { REVIEW, REVIEW_SUMMARY, SUBMITTED } from './quality-b39-fixtures';
import { ANA, LUIS, ORG_PROCESS, QMS_ID } from './quality-fixtures';
import { QualityReviewDetail } from './quality-review-detail';
import { QualityReviews } from './quality-reviews';

// Revisión por la dirección (B39; RE-SGC-007): Calidad prepara y envía; la Dirección aprueba.

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/calidad/revision-direccion',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

const QUALITY: readonly PermissionCode[] = ['qms.read', 'qms.review.manage'];
const DIRECTION: readonly PermissionCode[] = ['qms.read', 'qms.review.approve'];
const BASE = `/v1/qms/management-reviews/${REVIEW.id}`;

function serve(routes: object, codes: readonly PermissionCode[]): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(codes)),
    'GET /v1/qms/people': () => json({ data: [ANA, LUIS] }),
    'GET /v1/org-units': () => json({ data: [ORG_PROCESS] }),
    ...routes,
  });
}

it('lista las actas y Calidad crea una nueva', async () => {
  const sent = serve(
    {
      'GET /v1/qms/management-reviews': () => json({ data: [REVIEW_SUMMARY] }),
      'POST /v1/qms/management-reviews': () => json({ id: QMS_ID(97), code: 'RD-2026-0002' }, 201),
    },
    QUALITY,
  );
  show(<QualityReviews />);
  expect(await screen.findByRole('link', { name: 'Abrir RD-2026-0001' })).toBeInTheDocument();
  const create = await openDialog('Crear acta');
  await userEvent.type(within(create).getByLabelText('Fecha de la reunión'), '2026-12-15');
  await userEvent.type(within(create).getByLabelText('Asistentes y cargos'), 'Dirección');
  await userEvent.click(within(create).getByRole('button', { name: 'Crear' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/qms/management-reviews')?.body).toMatchObject({
      meeting_on: '2026-12-15',
      attendees: 'Dirección',
    });
  });
});

it('Calidad precarga, comenta, agrega una decisión y envía el acta', async () => {
  const sent = serve(
    {
      [`GET ${BASE}`]: () => json(REVIEW),
      [`POST ${BASE}/actions/load-inputs`]: () => noContent(),
      [`PATCH ${BASE}`]: () => noContent(),
      [`POST ${BASE}/actions/submit`]: () => noContent(),
    },
    QUALITY,
  );
  show(<QualityReviewDetail id={REVIEW.id} />);
  expect(await screen.findByText(/satisfacción promedio 4.20/u)).toBeInTheDocument();
  expect(screen.getByText('Falta un analista.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Aprobar acta/u })).not.toBeInTheDocument();
  await userEvent.click(
    await screen.findByRole('button', { name: 'Precargar entradas RD-2026-0001' }),
  );
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/load-inputs')?.headers['If-Match']).toBe('"2"');
  });
  const comment = await openDialog('Comentar: Satisfacción del cliente y PQRSF');
  await userEvent.type(within(comment).getByLabelText('Comentario o análisis'), 'Mejoró.');
  await userEvent.click(within(comment).getByRole('button', { name: 'Guardar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, BASE)?.body).toMatchObject({
      comments: [{ key: 'customer', comment: 'Mejoró.' }],
      decisions: [{ description: 'Contratar un analista.', responsible_id: LUIS.id }],
    });
  });
  await userEvent.click(screen.getByRole('button', { name: 'Enviar a la Dirección RD-2026-0001' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/submit')).toBeDefined();
  });
});

it('una decisión nueva se suma a las que ya tiene el acta', async () => {
  const sent = serve(
    { [`GET ${BASE}`]: () => json(REVIEW), [`PATCH ${BASE}`]: () => noContent() },
    QUALITY,
  );
  show(<QualityReviewDetail id={REVIEW.id} />);
  const add = await openDialog('Agregar decisión');
  await userEvent.type(within(add).getByLabelText('Decisión'), 'Revisar la política de calidad.');
  await userEvent.selectOptions(within(add).getByLabelText('Responsable'), ANA.id);
  await userEvent.type(within(add).getByLabelText('Fecha compromiso'), '2027-02-28');
  await userEvent.click(within(add).getByRole('button', { name: 'Guardar' }));
  await vi.waitFor(() => {
    const body = sentTo(sent, BASE)?.body as { decisions: unknown[] };
    expect(body.decisions).toHaveLength(2);
  });
  const conclusions = await openDialog('Asistentes y conclusiones');
  await userEvent.type(
    within(conclusions).getByLabelText(/Conclusiones/u),
    'El sistema es conveniente y eficaz.',
  );
  await userEvent.click(within(conclusions).getByRole('button', { name: 'Guardar' }));
  await vi.waitFor(() => {
    expect(sent.filter((request) => request.method === 'PATCH').at(-1)?.body).toMatchObject({
      conclusions: 'El sistema es conveniente y eficaz.',
    });
  });
});

it('la Dirección aprueba o devuelve el acta enviada', async () => {
  const sent = serve(
    {
      [`GET ${BASE}`]: () => json(SUBMITTED),
      [`POST ${BASE}/actions/approve`]: () => noContent(),
      [`POST ${BASE}/actions/return`]: () => noContent(),
    },
    DIRECTION,
  );
  show(<QualityReviewDetail id={REVIEW.id} />);
  expect(await screen.findByText('El sistema es eficaz.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Agregar decisión' })).not.toBeInTheDocument();
  const back = await openDialog('Devolver a Calidad');
  await userEvent.type(within(back).getByLabelText('Motivo'), 'Falta el análisis de proveedores.');
  await userEvent.click(within(back).getByRole('button', { name: 'Devolver' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/return')?.headers['If-Match']).toBe('"4"');
  });
  await userEvent.click(screen.getByRole('button', { name: 'Aprobar acta RD-2026-0001' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/approve')).toBeDefined();
  });
});

it('el acta aprobada muestra quién la aprobó, la acción de cada decisión y su PDF', async () => {
  const open = vi.fn();
  vi.stubGlobal('open', open);
  const approved = {
    ...SUBMITTED,
    status: 'approved' as const,
    approved_by: ANA,
    approved_on: '2026-12-11',
    document_id: QMS_ID(98),
    decisions: SUBMITTED.decisions.map((decision) => ({
      ...decision,
      action: { id: QMS_ID(99), code: 'AC-2026-0030' },
    })),
  };
  serve(
    {
      [`GET ${BASE}`]: () => json(approved),
      [`POST ${BASE}/download-link`]: () =>
        json({ url: 'https://archivos.test/acta.pdf', expires_at: '2026-12-11T15:05:00.000Z' }),
    },
    DIRECTION,
  );
  show(<QualityReviewDetail id={REVIEW.id} />);
  expect(await screen.findByText(/acción AC-2026-0030/u)).toBeInTheDocument();
  expect(screen.getByText(/Aprobó Ana Prueba/u)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Descargar el acta RD-2026-0001' }));
  await vi.waitFor(() => {
    expect(open).toHaveBeenCalledWith('https://archivos.test/acta.pdf', '_self');
  });
});

it('un acta devuelta muestra el motivo y la lista vacía lo dice', async () => {
  serve(
    {
      [`GET ${BASE}`]: () => json({ ...REVIEW, return_reason: 'Faltan los proveedores.' }),
      'GET /v1/qms/management-reviews': () => json({ data: [] }),
    },
    QUALITY,
  );
  show(
    <>
      <QualityReviewDetail id={REVIEW.id} />
      <QualityReviews />
    </>,
  );
  expect(await screen.findByText(/La Dirección la devolvió: Faltan/u)).toBeInTheDocument();
  expect(
    await screen.findByText('Aún no hay actas de revisión por la dirección.'),
  ).toBeInTheDocument();
});
