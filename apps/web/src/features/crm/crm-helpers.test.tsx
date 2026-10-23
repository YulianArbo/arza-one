import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { CRM_READER, serveCrm } from '../../test-support/crm-fixtures';
import { renderWithApi } from '../../test-support/fake-api';
import { bogotaInstant } from './activity-forms';
import { conversionProblems } from './convert-form';
import { CrmNav } from './crm-nav';
import { bogotaToday, formatPercent, formatPesos } from './labels';
import { EMPTY_LEAD, leadBody, leadErrors } from './lead-form-values';
import { opportunityProblems } from './opportunity-form';

// Piezas sin pantalla del CRM (B22): formatos, horas de Colombia y revisión de los formularios.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/comercial/prospectos/x',
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('formatos del CRM', () => {
  it('muestra pesos y porcentajes como en Colombia', () => {
    expect(formatPesos('1500000.50').replaceAll(' ', ' ')).toBe('$ 1.500.000,5');
    expect(formatPesos(null)).toBe('—');
    expect(formatPercent(37.5)).toBe('37,5 %');
    expect(formatPercent(null)).toBe('—');
  });

  it('usa la fecha y la hora de Colombia', () => {
    expect(bogotaToday(new Date('2026-10-23T03:00:00Z'))).toBe('2026-10-22');
    expect(bogotaInstant('2026-10-23T10:30')).toBe('2026-10-23T15:30:00.000Z');
    expect(bogotaInstant('')).toBeNull();
  });
});

describe('revisión de los formularios', () => {
  it('el prospecto pide nombre, contacto, necesidad y origen', () => {
    const errors = leadErrors(EMPTY_LEAD);
    expect(errors['first_name']).toBe('Escriba los nombres.');
    expect(errors['source']).toBe('Elija por dónde llegó.');
    const chosen = { ...EMPTY_LEAD, partyId: '01999a00-0000-7000-8000-00000000f002' };
    expect(leadBody(chosen)).toMatchObject({ person: null });
  });

  it('la conversión y la oportunidad revisan el valor en pesos', () => {
    const conversion = { partyId: 'x', title: 'Portal', value: '1.500.000', expectedClose: '' };
    expect(Object.keys(conversionProblems(conversion))).toEqual(['value', 'expectedClose']);
    const empty = { search: '', partyId: '', title: '', value: '', expectedClose: '' };
    expect(Object.keys(opportunityProblems(empty)).sort()).toEqual([
      'estimated_value',
      'expected_close',
      'party_id',
      'title',
    ]);
  });
});

describe('secciones de Comercial', () => {
  it('muestra solo las que la persona puede ver y marca la actual', async () => {
    serveCrm(CRM_READER);
    renderWithApi(
      <Screen>
        <CrmNav />
      </Screen>,
    );
    const current = await screen.findByRole('link', { name: 'Prospectos' });
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Informe del embudo' })).toBeVisible();
  });
});
