import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiError, json, mockApi, noContent, renderWithApi } from '../../test-support/fake-api';
import { forgetLinkToken } from '../access/link-token';
import { PublicPqrsfForm } from './public-pqrsf-form';
import { PublicPqrsfStatusLookup } from './public-pqrsf-status';
import { PublicSurveyPage } from './public-survey';

// Las páginas públicas del B29: radicar una PQRSF, consultar su estado con radicado y correo, y
// responder la encuesta desde el enlace del correo. Sin sesión. Datos ficticios.

const TOKEN = 'B'.repeat(43);

const SURVEY = {
  state: 'open',
  company: 'ARZA TECH S.A.S.',
  ticket_code: 'TIQ-2026-0001',
  ticket_subject: 'No carga el reporte',
  recommend_question: '¿Qué tan probable es que nos recomiende?',
  satisfaction_question: '¿Qué tan satisfecho quedó?',
  comment_question: '¿Quiere contarnos algo más?',
};

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  forgetLinkToken();
  window.history.replaceState(null, '', '/');
});

async function fillPqrsf(): Promise<void> {
  await userEvent.selectOptions(screen.getByLabelText('¿Qué quiere presentar?'), 'complaint');
  await userEvent.type(screen.getByLabelText('Nombre completo'), 'Ana Pérez');
  await userEvent.type(screen.getByLabelText('Correo'), 'ana@ejemplo.test');
  await userEvent.type(screen.getByLabelText('Asunto'), 'Demora en la entrega');
  await userEvent.type(screen.getByLabelText(/qué pasó/u), 'El entregable llegó tarde.');
}

describe('radicar una PQRSF', () => {
  it('pide los datos y la autorización, y muestra el radicado y la fecha límite', async () => {
    const sent = mockApi({
      'POST /v1/public/pqrsf': () =>
        json(
          {
            code: 'PQRSF-2026-0007',
            type: 'complaint',
            received_at: '2026-11-07T15:00:00.000Z',
            due_on: '2026-11-30',
          },
          201,
        ),
    });
    renderWithApi(<PublicPqrsfForm />);
    await userEvent.click(screen.getByRole('button', { name: 'Radicar' }));
    expect(screen.getAllByText(/debe aceptar el tratamiento/u).length).toBeGreaterThan(0);
    await fillPqrsf();
    await userEvent.type(screen.getByLabelText('Teléfono (opcional)'), 'abc');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Radicar' }));
    expect(screen.getAllByText(/teléfono de 7 a 20/u).length).toBeGreaterThan(0);
    await userEvent.clear(screen.getByLabelText('Teléfono (opcional)'));
    await userEvent.click(screen.getByRole('button', { name: 'Radicar' }));
    expect(await screen.findByText('PQRSF-2026-0007')).toBeVisible();
    expect(screen.getByText(/30\/11\/2026/u)).toBeVisible();
    expect(sent[0]?.body).toMatchObject({
      type: 'complaint',
      phone: null,
      website: '',
      accepts_privacy: true,
    });
  });
});

describe('radicar sin servicio', () => {
  it('explica si el formulario no está disponible', async () => {
    mockApi({
      'POST /v1/public/pqrsf': () =>
        apiError(
          503,
          'SERVICE_PUBLIC_UNAVAILABLE',
          'El formulario no está disponible en este momento.',
        ),
    });
    renderWithApi(<PublicPqrsfForm />);
    await fillPqrsf();
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Radicar' }));
    expect(await screen.findByText(/no está disponible/u)).toBeVisible();
  });
});

describe('consultar una PQRSF', () => {
  it('pide radicado y correo, y muestra la respuesta', async () => {
    const sent = mockApi({
      'POST /v1/public/pqrsf/status': () =>
        json({
          code: 'PQRSF-2026-0007',
          type: 'complaint',
          status: 'responded',
          received_at: '2026-11-07T15:00:00.000Z',
          due_on: '2026-11-30',
          responded_at: '2026-11-10T15:00:00.000Z',
          response: 'Ajustamos el cronograma.',
        }),
    });
    renderWithApi(<PublicPqrsfStatusLookup />);
    await userEvent.click(screen.getByRole('button', { name: 'Consultar' }));
    expect(screen.getAllByText(/como aparece en el acuse/u).length).toBeGreaterThan(0);
    await userEvent.type(screen.getByLabelText('Radicado'), 'pqrsf-2026-0007');
    await userEvent.type(screen.getByLabelText('Correo con que radicó'), 'ana@ejemplo.test');
    await userEvent.click(screen.getByRole('button', { name: 'Consultar' }));
    expect(await screen.findByText('Ajustamos el cronograma.')).toBeVisible();
    expect(screen.getByText('Respondida')).toBeVisible();
    expect(sent[0]?.body).toEqual({ code: 'PQRSF-2026-0007', email: 'ana@ejemplo.test' });
  });
});

describe('consultar una PQRSF en trámite o inexistente', () => {
  it('dice que sigue en trámite, o que no coincide', async () => {
    let found = true;
    mockApi({
      'POST /v1/public/pqrsf/status': () =>
        found
          ? json({
              code: 'PQRSF-2026-0007',
              type: 'petition',
              status: 'classified',
              received_at: '2026-11-07T15:00:00.000Z',
              due_on: '2026-11-30',
              responded_at: null,
              response: null,
            })
          : apiError(
              404,
              'SERVICE_NOT_FOUND',
              'No encontramos una PQRSF con ese radicado y ese correo.',
            ),
    });
    renderWithApi(<PublicPqrsfStatusLookup />);
    await userEvent.type(screen.getByLabelText('Radicado'), 'PQRSF-2026-0007');
    await userEvent.type(screen.getByLabelText('Correo con que radicó'), 'ana@ejemplo.test');
    await userEvent.click(screen.getByRole('button', { name: 'Consultar' }));
    expect(await screen.findByText(/Todavía la estamos tramitando/u)).toBeVisible();
    found = false;
    await userEvent.click(screen.getByRole('button', { name: 'Consultar' }));
    expect(await screen.findByText(/No encontramos/u)).toBeVisible();
  });
});

describe('encuesta', () => {
  it('pide las dos calificaciones y agradece', async () => {
    window.history.replaceState(null, '', `/encuesta#token=${TOKEN}`);
    const sent = mockApi({
      'POST /v1/public/surveys/view': () => json(SURVEY),
      'POST /v1/public/surveys/answer': () => noContent(),
    });
    renderWithApi(<PublicSurveyPage />);
    expect(await screen.findByText(/TIQ-2026-0001/u)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar mi respuesta' }));
    expect(screen.getAllByText('Elija un número de 0 a 10.').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByLabelText('9'));
    await userEvent.click(screen.getAllByLabelText('4')[1] ?? document.body);
    await userEvent.type(screen.getByLabelText('¿Quiere contarnos algo más?'), 'Rápidos.');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar mi respuesta' }));
    expect(await screen.findByText(/Recibimos su respuesta/u)).toBeVisible();
    const answer = sent.find((r) => r.path.endsWith('/answer'))?.body;
    expect(answer).toEqual({ token: TOKEN, score: 9, satisfaction: 4, comment: 'Rápidos.' });
  });
});

describe('encuesta cerrada', () => {
  it('dice si ya se respondió', async () => {
    window.history.replaceState(null, '', `/encuesta#token=${TOKEN}`);
    mockApi({ 'POST /v1/public/surveys/view': () => json({ ...SURVEY, state: 'answered' }) });
    renderWithApi(<PublicSurveyPage />);
    expect(await screen.findByText(/ya se respondió/u)).toBeVisible();
  });
});

describe('encuesta sin enlace', () => {
  it('dice que el enlace está incompleto', async () => {
    window.history.replaceState(null, '', '/encuesta');
    mockApi({});
    renderWithApi(<PublicSurveyPage />);
    expect(await screen.findByText(/El enlace no está completo/u)).toBeVisible();
  });
});
