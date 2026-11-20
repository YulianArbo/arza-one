import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CORE_ADMIN, Screen, serveCore } from '../../test-support/core-fixtures';
import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import { ParametersPanel, describeValue } from './parameters-panel';

// Reglas laborales (B36, decisiones 4, 5 y 8) en Administración › Parámetros: se muestran en
// palabras y se programan como cualquier parámetro con vigencia.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/administracion/parametros',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const RULES = {
  weekly_hours: 40,
  overtime_daily_max: 2,
  overtime_weekly_max: 12,
  vacation_days_per_year: 15,
  disciplinary_notice_days: 3,
};

const PARAMETER = {
  key: 'hr.labor_rules',
  label: 'Reglas laborales',
  description: 'Jornada, horas extras, vacaciones y citación.',
  current: {
    id: '01999a00-0000-7000-8000-0000000d0301',
    value: RULES,
    valid_from: '2026-01-01',
    valid_to: null,
    created_at: '2026-01-01T05:00:00.000Z',
    created_by: null,
  },
  scheduled: null,
};

describe('reglas laborales en palabras', () => {
  it('dice la jornada, los topes, las vacaciones y el plazo de citación', () => {
    const text = describeValue(RULES);
    expect(text).toContain('Jornada de 40 horas a la semana');
    expect(text).toContain('horas extras hasta 2 al día y 12 a la semana');
    expect(text).toContain('15 días hábiles de vacaciones por año');
  });
});

describe('programar reglas nuevas', () => {
  it('avisa si el tope diario supera el semanal y guarda los valores', async () => {
    const sent = serveCore(CORE_ADMIN, {
      'GET /v1/parameters': () => json({ data: [PARAMETER] }),
      'POST /v1/parameters/hr.labor_rules/versions': () => noContent(),
    });
    renderWithApi(
      <Screen>
        <ParametersPanel />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Programar un cambio' }));
    const dialog = await screen.findByRole('dialog');
    const daily = within(dialog).getByLabelText('Tope de horas extras por día');
    await userEvent.clear(daily);
    await userEvent.type(daily, '20');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Programar el cambio' }));
    expect(within(dialog).getByText(/el máximo es 12|no puede superar/u)).toBeVisible();
    await userEvent.clear(daily);
    await userEvent.type(daily, '3');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Programar el cambio' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'POST')?.body).toMatchObject({
        value: { ...RULES, overtime_daily_max: 3 },
      });
    });
  });
});
