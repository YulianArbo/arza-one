import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DOCUMENT_ID,
  PROCESS_ID,
  QUALITY_SGC,
  READER,
  REQUEST_ID,
  requestOf,
  serveDocuments,
} from '../../test-support/doc-fixtures';
import { json, noContent } from '../../test-support/fake-api';
import { renderWithApi } from '../../test-support/fake-api';
import { Screen } from '../../test-support/privacy-fixtures';
import { ChangeRequestDetail } from './change-request-detail';
import { ChangeRequestForm } from './change-request-form';
import { ChangeRequestList } from './change-request-list';

// Solicitudes de Acción Documental (B19, FT-SGC-001): lista, radicación y ficha con sus pasos.

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push, back: vi.fn() }),
  usePathname: () => '/app/documentos/solicitudes',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  push.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const REQUEST_PATH = `GET /v1/change-requests/${REQUEST_ID}`;

describe('lista de solicitudes', () => {
  it('muestra código, acción, estado y quién la pidió; filtra por estado', async () => {
    const sent = serveDocuments(QUALITY_SGC);
    renderWithApi(
      <Screen>
        <ChangeRequestList />
      </Screen>,
    );
    expect(await screen.findByRole('link', { name: 'SAD-2026-0001' })).toBeVisible();
    expect(screen.getByText('Creación')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Nueva solicitud' })).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'approved');
    await vi.waitFor(() => {
      expect(sent.some((r) => r.search.includes('status=approved'))).toBe(true);
    });
  });

  it('sin solicitudes explica cómo empezar; sin permiso no ofrece radicar', async () => {
    serveDocuments(READER, {
      'GET /v1/change-requests': () => json({ data: [], next_cursor: null }),
    });
    renderWithApi(
      <Screen>
        <ChangeRequestList />
      </Screen>,
    );
    expect(await screen.findByText('No hay solicitudes')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Nueva solicitud' })).toBeNull();
  });
});

describe('radicar una solicitud', () => {
  it('explica lo que falta y radica una creación con su justificación', async () => {
    const sent = serveDocuments(QUALITY_SGC, {
      'POST /v1/change-requests': () => json({ id: REQUEST_ID }, 201),
    });
    renderWithApi(
      <Screen>
        <ChangeRequestForm documentId={null} action={null} />
      </Screen>,
    );
    await screen.findByRole('option', { name: 'PR · Procedimiento' });
    await userEvent.click(screen.getByRole('button', { name: 'Radicar' }));
    expect(await screen.findByText('Elija el tipo de documento.')).toBeVisible();
    expect(screen.getByText('Explique por qué (10 a 2000 caracteres).')).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText('Tipo de documento'), 'PR');
    await userEvent.selectOptions(screen.getByLabelText('Proceso'), PROCESS_ID);
    await userEvent.type(screen.getByLabelText('Nombre del documento'), 'Control de registros');
    await userEvent.type(screen.getByLabelText('Justificación'), 'El proceso lo necesita ya.');
    await userEvent.click(screen.getByRole('button', { name: 'Radicar' }));
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/app/documentos/solicitudes/${REQUEST_ID}`);
    });
    expect(sent.find((r) => r.method === 'POST')?.body).toEqual({
      action: 'create',
      document_id: null,
      doc_type: 'PR',
      process_id: PROCESS_ID,
      title: 'Control de registros',
      justification: 'El proceso lo necesita ya.',
    });
  });
});

describe('radicar una solicitud: desde la ficha', () => {
  it('desde la ficha del documento llega lista para modificarlo', async () => {
    const entry = {
      document_id: DOCUMENT_ID,
      code: 'PR-SGC-001',
      title: 'Control de documentos',
      doc_type: 'PR',
      doc_type_label: 'Procedimiento',
      process: null,
      version_label: '00',
      effective_date: '2026-10-16',
      status: 'current',
      owner_position: null,
    };
    const sent = serveDocuments(QUALITY_SGC, {
      'GET /v1/master-list': () => json({ data: [entry], total: 1 }),
      'POST /v1/change-requests': () => json({ id: REQUEST_ID }, 201),
    });
    renderWithApi(
      <Screen>
        <ChangeRequestForm documentId={DOCUMENT_ID} action="update" />
      </Screen>,
    );
    await screen.findByRole('option', { name: 'PR-SGC-001 · Control de documentos' });
    expect(screen.getByLabelText('Documento vigente')).toHaveValue(DOCUMENT_ID);
    await userEvent.type(screen.getByLabelText('Justificación'), 'Cambia el alcance del proceso.');
    await userEvent.click(screen.getByRole('button', { name: 'Radicar' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'POST')?.body).toMatchObject({
        action: 'update',
        document_id: DOCUMENT_ID,
        title: null,
      });
    });
  });
});

function renderDetail(): void {
  renderWithApi(
    <Screen>
      <ChangeRequestDetail id={REQUEST_ID} />
    </Screen>,
  );
}

describe('ficha de la solicitud', () => {
  it('Calidad empieza el análisis con confirmación', async () => {
    const filed = requestOf({ status: 'filed', step: 'Radicada', actions: ['analyze'] });
    const sent = serveDocuments(QUALITY_SGC, {
      [REQUEST_PATH]: () => json(filed),
      [`POST /v1/change-requests/${REQUEST_ID}/actions/analyze`]: () => noContent(),
    });
    renderDetail();
    expect(await screen.findByText('Radicada', { selector: 'dd' })).toBeVisible();
    await userEvent.click(await screen.findByRole('button', { name: 'Empezar el análisis' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, empezar el análisis' }));
    await vi.waitFor(() => {
      const step = sent.find((r) => r.path.endsWith('/actions/analyze'));
      expect(step?.headers['If-Match']).toBe('"3"');
    });
  });

  it('rechazar pide el motivo', async () => {
    const analysis = requestOf({ status: 'in_analysis', actions: ['approve', 'reject'] });
    const sent = serveDocuments(QUALITY_SGC, {
      [REQUEST_PATH]: () => json(analysis),
      [`POST /v1/change-requests/${REQUEST_ID}/actions/reject`]: () => noContent(),
    });
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'Rechazar' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rechazar' }));
    expect(
      await within(dialog).findByText('Escriba el motivo (5 a 2000 caracteres).'),
    ).toBeVisible();
    await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Ya existe otro procedimiento.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rechazar' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.path.endsWith('/actions/reject'))?.body).toEqual({
        comment: 'Ya existe otro procedimiento.',
      });
    });
  });
});

describe('ficha de la solicitud: decidida', () => {
  it('aprobada, ofrece el siguiente paso: crear el documento', async () => {
    serveDocuments(QUALITY_SGC, { [REQUEST_PATH]: () => json(requestOf()) });
    renderDetail();
    expect(await screen.findByRole('link', { name: 'Crear el documento' })).toBeVisible();
  });

  it('decidida, enlaza su FT-SGC-001 con el PDF (B20)', async () => {
    const formRecordId = '01999a00-0000-7000-8000-00000000e101';
    serveDocuments(QUALITY_SGC, {
      [REQUEST_PATH]: () => json(requestOf({ form_record_id: formRecordId })),
    });
    renderDetail();
    const link = await screen.findByRole('link', {
      name: 'Ver el FT-SGC-001 de esta solicitud, con su PDF',
    });
    expect(link).toHaveAttribute('href', `/app/documentos/registros/${formRecordId}`);
  });

  it('una solicitud rechazada muestra el motivo de la decisión', async () => {
    const rejected = requestOf({ status: 'rejected', decision_note: 'No hace falta.' });
    serveDocuments(QUALITY_SGC, { [REQUEST_PATH]: () => json(rejected) });
    renderDetail();
    expect(await screen.findByText('Motivo de la decisión: «No hace falta.»')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Crear el documento' })).toBeNull();
  });
});
