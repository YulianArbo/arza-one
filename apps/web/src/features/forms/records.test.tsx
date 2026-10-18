import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiError, json, noContent, renderWithApi } from '../../test-support/fake-api';
import {
  COMPLETED,
  DESIGNER,
  FORM_READER,
  PARTY_ID,
  RECORD_ID,
  TEMPLATE_ID,
  VERSION_ID,
  recordOf,
  serveForms,
  templateOf,
} from '../../test-support/form-fixtures';
import { Screen } from '../../test-support/privacy-fixtures';
import { RecordDetail } from './record-detail';
import { RecordFill } from './record-fill';

// Registros diligenciados (B20): diligenciar con borrador, guardar, enviar con lo obligatorio,
// aprobar o devolver y descargar el PDF.

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push, back: vi.fn() }),
  usePathname: () => '/app/documentos/registros',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  push.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const RECORD = `GET /v1/form-records/${RECORD_ID}`;

const waiting = recordOf({
  status: 'in_approval',
  step: 'Aprobación de Dirección',
  actions: ['approve', 'reject'],
  created_by: { id: '01999a00-0000-7000-8000-00000000a002', name: 'Carlos Ruiz' },
});

function renderFill(entity = { type: null as string | null, id: null as string | null }) {
  return renderWithApi(
    <Screen>
      <RecordFill templateId={TEMPLATE_ID} entity={entity} />
    </Screen>,
  );
}

describe('diligenciar un formato', () => {
  it('guarda el borrador incompleto y lleva a la ficha del registro', async () => {
    const sent = serveForms(DESIGNER, {
      'POST /v1/form-records': () => json({ id: RECORD_ID }, 201),
    });
    renderFill();
    await userEvent.type(await screen.findByLabelText('Cliente'), 'Cliente Ficticio S.A.S.');
    await userEvent.selectOptions(screen.getByLabelText('Decisión'), 'Viable');
    await userEvent.click(screen.getByLabelText('¿Acepta?'));
    await userEvent.click(screen.getByRole('radio', { name: 'Cumple' }));
    await userEvent.type(screen.getByLabelText('Observación: Código correcto'), 'Sin novedad');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar fila a «Compromisos»' }));
    await userEvent.type(screen.getByLabelText('Actividad, fila 1'), 'Enviar cronograma');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/app/documentos/registros/${RECORD_ID}`);
    });
    const body = sent.find((r) => r.method === 'POST')?.body as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({
      cliente: 'Cliente Ficticio S.A.S.',
      decision: 'Viable',
      acepta: true,
      puntos: [{ result: 'yes', note: 'Sin novedad' }],
      compromisos: [{ actividad: 'Enviar cronograma', fecha: '' }],
    });
  });
});

describe('diligenciar un formato', () => {
  it('no deja guardar un valor que no cumple su tipo y quita filas de las tablas', async () => {
    const sent = serveForms(DESIGNER);
    renderFill();
    await userEvent.type(await screen.findByLabelText('Valor'), 'mil');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar fila a «Compromisos»' }));
    await userEvent.click(screen.getByRole('button', { name: 'Quitar fila 1' }));
    expect(screen.getByText('Sin filas todavía.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(await screen.findByText('Revise este campo.')).toBeVisible();
    expect(sent.some((r) => r.method === 'POST')).toBe(false);
  });
});

describe('diligenciar un formato', () => {
  it('el conocimiento del cliente pide elegir el tercero', async () => {
    const sent = serveForms(DESIGNER, {
      [`GET /v1/form-templates/${TEMPLATE_ID}`]: () => json(templateOf({ entity_type: 'party' })),
      'POST /v1/form-records': () => json({ id: RECORD_ID }, 201),
    });
    renderFill();
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar borrador' }));
    expect(await screen.findByText('Elija el tercero.')).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText('Tercero'), PARTY_ID);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'POST')?.body).toMatchObject({
        entity_type: 'party',
        entity_id: PARTY_ID,
      });
    });
  });
});

describe('diligenciar un formato', () => {
  it('la lista de verificación llega unida a su versión; sin ella explica de dónde se diligencia', async () => {
    serveForms(DESIGNER, {
      [`GET /v1/form-templates/${TEMPLATE_ID}`]: () =>
        json(templateOf({ entity_type: 'doc_version' })),
    });
    const { unmount } = renderFill();
    expect(await screen.findByRole('alert')).toHaveTextContent('versión de un documento');
    unmount();
    const sent = serveForms(DESIGNER, {
      [`GET /v1/form-templates/${TEMPLATE_ID}`]: () =>
        json(templateOf({ entity_type: 'doc_version' })),
      'POST /v1/form-records': () => json({ id: RECORD_ID }, 201),
    });
    renderFill({ type: 'doc_version', id: VERSION_ID });
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar borrador' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'POST')?.body).toMatchObject({
        entity_type: 'doc_version',
        entity_id: VERSION_ID,
      });
    });
  });
});

describe('ficha del registro: borrador', () => {
  it('guarda los cambios y solo envía con lo obligatorio', async () => {
    const sent = serveForms(DESIGNER, {
      [`PATCH /v1/form-records/${RECORD_ID}`]: () => noContent(),
      [`POST /v1/form-records/${RECORD_ID}/actions/submit`]: () => noContent(),
    });
    renderWithApi(
      <Screen>
        <RecordDetail id={RECORD_ID} />
      </Screen>,
    );
    await userEvent.type(await screen.findByLabelText('Notas'), 'Primera reunión');
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    expect(screen.getByText('Guarde los cambios antes de enviar.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'PATCH')?.body).toMatchObject({
        data: { notas: 'Primera reunión' },
      });
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Responda todos los puntos.')).toBeVisible();
    await userEvent.click(screen.getByRole('radio', { name: 'No aplica' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Enviar' })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await vi.waitFor(() => {
      expect(sent.some((r) => r.path.endsWith('/actions/submit'))).toBe(true);
    });
  });
});

describe('ficha del registro: borrador', () => {
  it('muestra el motivo de la devolución', async () => {
    serveForms(DESIGNER, {
      [RECORD]: () => json(recordOf({ return_note: 'Falta el presupuesto.' })),
    });
    renderWithApi(
      <Screen>
        <RecordDetail id={RECORD_ID} />
      </Screen>,
    );
    expect(
      await screen.findByText('Devuelto para corregir: «Falta el presupuesto.»'),
    ).toBeVisible();
  });
});

describe('ficha del registro: aprobación', () => {
  it('quien atiende la aprobación aprueba', async () => {
    const sent = serveForms(DESIGNER, {
      [RECORD]: () => json(waiting),
      [`POST /v1/form-records/${RECORD_ID}/actions/approve`]: () => noContent(),
    });
    renderWithApi(
      <Screen>
        <RecordDetail id={RECORD_ID} />
      </Screen>,
    );
    expect(await screen.findByText('Aprobación de Dirección')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, aprobar' }));
    await vi.waitFor(() => {
      expect(sent.some((r) => r.path.endsWith('/actions/approve'))).toBe(true);
    });
  });
});

describe('ficha del registro: aprobación', () => {
  it('devolver exige el motivo', async () => {
    const sent = serveForms(DESIGNER, {
      [RECORD]: () => json(waiting),
      [`POST /v1/form-records/${RECORD_ID}/actions/reject`]: () => noContent(),
    });
    renderWithApi(
      <Screen>
        <RecordDetail id={RECORD_ID} />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Devolver' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Devolver' }));
    expect(within(dialog).getByText('Escriba el motivo (5 a 2000 caracteres).')).toBeVisible();
    await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Falta el presupuesto.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Devolver' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.path.endsWith('/actions/reject'))?.body).toEqual({
        comment: 'Falta el presupuesto.',
      });
    });
  });
});

describe('ficha del registro: aprobación', () => {
  it('un error de la API se muestra', async () => {
    serveForms(DESIGNER, {
      [RECORD]: () => json(waiting),
      [`POST /v1/form-records/${RECORD_ID}/actions/approve`]: () =>
        apiError(403, 'DOC_SELF_APPROVAL', 'Quien elabora una versión no puede aprobarla.'),
    });
    renderWithApi(
      <Screen>
        <RecordDetail id={RECORD_ID} />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Aprobar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, aprobar' }));
    expect(await screen.findByText('Quien elabora una versión no puede aprobarla.')).toBeVisible();
  });
});

describe('ficha del registro: terminado', () => {
  it('se lee con sus valores y descarga el PDF', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    serveForms(FORM_READER, {
      [RECORD]: () =>
        json({
          ...COMPLETED,
          entity: { type: 'party', id: PARTY_ID, label: 'Organización Ficticia S.A.S.' },
        }),
      [`POST /v1/form-records/${RECORD_ID}/pdf`]: () =>
        json({
          url: 'http://api.test/v1/files/downloads/llave',
          expires_at: '2026-10-16T16:05:00.000Z',
        }),
    });
    renderWithApi(
      <Screen>
        <RecordDetail id={RECORD_ID} />
      </Screen>,
    );
    expect(await screen.findByText('18/10/2026')).toBeVisible();
    expect(screen.getByText('No cumple')).toBeVisible();
    expect(screen.getByText('Enviar cronograma')).toBeVisible();
    expect(screen.getByText('Sí')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Organización Ficticia S.A.S.' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    await vi.waitFor(() => {
      expect(open).toHaveBeenCalledWith('http://api.test/v1/files/downloads/llave', '_self');
    });
  });
});
