import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CORE_ADMIN,
  CORE_READER,
  HOLIDAY_ID,
  SCHEDULE,
  SEQUENCE_ID,
  SEQUENCES,
  Screen,
  serveCore,
} from '../../test-support/core-fixtures';
import { apiError, json, noContent, renderWithApi } from '../../test-support/fake-api';
import { HolidaysPanel } from './holidays-panel';
import { ParametersPanel, describeDays, describeSchedule } from './parameters-panel';
import { SequencesPanel } from './sequences-panel';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/administracion',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parámetros', () => {
  it('describe el horario en palabras', () => {
    expect(describeSchedule(SCHEDULE)).toBe(
      'De lunes a viernes, 08:00 a 12:00 y 13:00 a 17:00: 40 horas a la semana.',
    );
    expect(describeDays([6, 1, 3])).toBe('lunes, miércoles, sábado');
  });
});

describe('parámetros (2)', () => {
  it('muestra el horario vigente y el historial; quien solo lee no programa cambios', async () => {
    serveCore(CORE_READER);
    renderWithApi(
      <Screen>
        <ParametersPanel />
      </Screen>,
    );
    expect(await screen.findByText(/Desde el 01\/01\/2026/)).toBeVisible();
    expect(await screen.findByText('Ana Pérez')).toBeVisible();
    expect(screen.getByText('Sigue vigente')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Programar un cambio' })).toBeNull();
  });
});

describe('parámetros (3)', () => {
  it('programa un cambio con la fecha de inicio y avisa si el horario no es válido', async () => {
    const sent = serveCore(CORE_ADMIN, {
      'POST /v1/parameters/work.schedule/versions': () => noContent(),
    });
    renderWithApi(
      <Screen>
        <ParametersPanel />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Programar un cambio' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('status')).toHaveTextContent('Total: 40 horas a la semana.');
    await userEvent.click(within(dialog).getByLabelText('Sábado'));
    const morningEnd = within(dialog).getAllByLabelText('Hasta')[0];
    if (morningEnd === undefined) throw new Error('Falta el campo');
    await userEvent.clear(morningEnd);
    await userEvent.type(morningEnd, '07:00');
    expect(within(dialog).getByRole('status')).toHaveTextContent('posterior a la inicial');
    await userEvent.clear(morningEnd);
    await userEvent.type(morningEnd, '12:00');
    const from = within(dialog).getByLabelText('Rige desde');
    await userEvent.clear(from);
    await userEvent.type(from, '2027-01-01');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Programar el cambio' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'POST')?.body).toEqual({
        value: { ...SCHEDULE, days: [1, 2, 3, 4, 5, 6] },
        valid_from: '2027-01-01',
      });
    });
  });
});

describe('consecutivos', () => {
  it('muestra el siguiente código y crea un tipo nuevo', async () => {
    const sent = serveCore(CORE_ADMIN, {
      'POST /v1/sequences': () => json({ id: SEQUENCE_ID }, 201),
    });
    renderWithApi(
      <Screen>
        <SequencesPanel />
      </Screen>,
    );
    expect(await screen.findByText('COT-2026-0007')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Agregar un consecutivo' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'PQRSF');
    await userEvent.type(within(dialog).getByLabelText('Clave técnica'), 'service.pqrsf');
    await userEvent.type(within(dialog).getByLabelText('Prefijo'), 'pqr');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'POST')?.body).toEqual({
        key: 'service.pqrsf',
        name: 'PQRSF',
        prefix: 'PQR',
        padding: 4,
      });
    });
  });
});

describe('consecutivos (2)', () => {
  it('edita el prefijo sin tocar la clave', async () => {
    const sent = serveCore(CORE_ADMIN, {
      [`PATCH /v1/sequences/${SEQUENCE_ID}`]: () => json({ ...SEQUENCES.data[0], prefix: 'OFE' }),
    });
    renderWithApi(
      <Screen>
        <SequencesPanel />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Cotizaciones' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Clave técnica')).toBeDisabled();
    await userEvent.clear(within(dialog).getByLabelText('Prefijo'));
    await userEvent.type(within(dialog).getByLabelText('Prefijo'), 'ofe');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'PATCH')?.body).toEqual({
        name: 'Cotizaciones',
        prefix: 'OFE',
        padding: 4,
      });
    });
  });
});

describe('consecutivos (3)', () => {
  it('sin consecutivos lo dice', async () => {
    serveCore(CORE_ADMIN, { 'GET /v1/sequences': () => json({ data: [] }) });
    renderWithApi(
      <Screen>
        <SequencesPanel />
      </Screen>,
    );
    expect(await screen.findByText('Todavía no hay consecutivos')).toBeVisible();
  });
});

describe('festivos y días hábiles', () => {
  it('lista, agrega y quita festivos del año elegido', async () => {
    const sent = serveCore(CORE_ADMIN, {
      'POST /v1/holidays': () => json({ id: HOLIDAY_ID }, 201),
      [`DELETE /v1/holidays/${HOLIDAY_ID}`]: () => noContent(),
    });
    renderWithApi(
      <Screen>
        <HolidaysPanel />
      </Screen>,
    );
    expect(await screen.findByText('20/07/2026')).toBeVisible();
    expect(screen.getByText('lunes')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Fecha'), '2026-09-15');
    await userEvent.type(screen.getByLabelText('Nombre'), 'Día cívico');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar el festivo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, quitar' }));
    await vi.waitFor(() => {
      expect(sent.some((r) => r.method === 'DELETE')).toBe(true);
    });
    expect(sent.find((r) => r.method === 'POST')?.body).toEqual({
      date: '2026-09-15',
      name: 'Día cívico',
    });
    await userEvent.selectOptions(
      screen.getByLabelText('Año'),
      String(new Date().getFullYear() + 1),
    );
    await vi.waitFor(() => {
      expect(sent.some((r) => r.search === `?year=${String(new Date().getFullYear() + 1)}`)).toBe(
        true,
      );
    });
  });
});

describe('festivos y días hábiles (2)', () => {
  it('calcula un vencimiento y muestra el error si la API lo rechaza', async () => {
    let calls = 0;
    serveCore(CORE_READER, {
      'GET /v1/business-days': () => {
        calls += 1;
        return calls === 1
          ? json({ from: '2026-03-31', days: 2, date: '2026-04-06' })
          : apiError(422, 'VALIDATION_FAILED', 'Los datos enviados no son válidos.');
      },
    });
    renderWithApi(
      <Screen>
        <HolidaysPanel />
      </Screen>,
    );
    await userEvent.type(await screen.findByLabelText('Fecha de partida'), '2026-03-31');
    await userEvent.clear(screen.getByLabelText('Días hábiles'));
    await userEvent.type(screen.getByLabelText('Días hábiles'), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Calcular' }));
    expect(await screen.findByText('El plazo vence el lunes 06/04/2026.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Calcular' }));
    expect(await screen.findByText('Los datos enviados no son válidos.')).toBeVisible();
  });
});
