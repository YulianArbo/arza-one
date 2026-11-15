import { describe, expect, it } from 'vitest';

import {
  assignAssetSchema,
  completeMaintenanceSchema,
  retireAssetSchema,
  saveAssetSchema,
  type Asset,
} from './assets.js';
import {
  ASSET_BOOK_COLUMNS,
  assetBookCsv,
  assetBookFileName,
  fullMonthsBetween,
  straightLineDepreciation,
} from './book.js';

const ID = '0195f3a2-7c41-7b9e-9d2a-3f4e5a6b7c8d';

const LAPTOP = { cost: '3600000.00', purchaseDate: '2026-01-15', usefulLifeMonths: 36 };

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: ID,
    code: 'ACT-2026-0001',
    name: 'Portátil de desarrollo',
    category: 'computer',
    serial: 'SN-001',
    purchase_date: '2026-01-15',
    cost: '3600000.00',
    useful_life_months: 36,
    status: 'available',
    location: 'Sede principal',
    assignment: null,
    retired_on: null,
    retire_reason: null,
    retire_note: null,
    accumulated_depreciation: '900000.00',
    book_value: '2700000.00',
    version: 1,
    ...overrides,
  };
}

describe('depreciación informativa de activos B34', () => {
  it('cuenta meses completos desde la compra', () => {
    expect(fullMonthsBetween('2026-01-15', '2026-01-31')).toBe(0);
    expect(fullMonthsBetween('2026-01-15', '2026-02-14')).toBe(0);
    expect(fullMonthsBetween('2026-01-15', '2026-02-15')).toBe(1);
    expect(fullMonthsBetween('2026-01-15', '2027-01-15')).toBe(12);
    expect(fullMonthsBetween('2026-01-15', '2025-12-01')).toBe(0);
  });

  it('reparte el costo por igual en la vida útil', () => {
    expect(straightLineDepreciation(LAPTOP, '2026-10-15')).toEqual({
      accumulated: '900000.00',
      bookValue: '2700000.00',
    });
  });

  it('no deprecia antes de un mes ni más que el costo', () => {
    expect(straightLineDepreciation(LAPTOP, '2026-01-20').accumulated).toBe('0.00');
    expect(straightLineDepreciation(LAPTOP, '2040-01-01')).toEqual({
      accumulated: '3600000.00',
      bookValue: '0.00',
    });
  });

  it('conserva los centavos cuando la división no es exacta', () => {
    const odd = { cost: '1000.00', purchaseDate: '2026-01-01', usefulLifeMonths: 3 };
    expect(straightLineDepreciation(odd, '2026-02-01')).toEqual({
      accumulated: '333.33',
      bookValue: '666.67',
    });
  });
});

describe('libro de activos B34', () => {
  it('lleva el encabezado, punto y coma, coma decimal y fechas dd/mm/aaaa', () => {
    const lines = assetBookCsv([asset()]).replace('﻿', '').trimEnd().split('\r\n');
    expect(lines[0]).toBe(ASSET_BOOK_COLUMNS.join(';'));
    expect(lines[1]).toBe(
      'ACT-2026-0001;Portátil de desarrollo;Equipo de cómputo;SN-001;15/01/2026;3600000,00;36;' +
        '900000,00;2700000,00;Disponible;Sede principal;;;;',
    );
  });

  it('muestra responsable y comodato solo cuando la asignación está vigente', () => {
    const assignment = {
      id: ID,
      holder: { id: ID, name: 'Ana Gómez' },
      status: 'active' as const,
      assigned_on: '2026-11-01',
      sign_by: '2026-11-16',
      record_code: 'CT-ADM-001-2026-0001',
      envelope_code: 'FE-2026-0001',
      contract_document_id: ID,
      returned_on: null,
      return_note: null,
      closed_reason: null,
      version: 2,
    };
    const active = assetBookCsv([asset({ status: 'assigned', assignment })]);
    expect(active).toContain('Asignado;Sede principal;Ana Gómez;01/11/2026;CT-ADM-001-2026-0001;');
    const pending = assetBookCsv([
      asset({ status: 'reserved', assignment: { ...assignment, status: 'in_signature' } }),
    ]);
    expect(pending).toContain('Pendiente de firma;Sede principal;;;;');
  });

  it('protege las celdas con separador o con fórmulas', () => {
    const csv = assetBookCsv([asset({ name: 'Silla; ergonómica', serial: '=1+1' })]);
    expect(csv).toContain('"Silla; ergonómica"');
    expect(csv).toContain(";'=1+1;");
    expect(assetBookFileName('2026-11-12')).toBe('libro-de-activos-2026-11-12.csv');
  });
});

describe('formularios de activos B34', () => {
  const valid = {
    name: 'Portátil de desarrollo',
    category: 'computer',
    purchase_date: '2026-01-15',
    cost: '3600000',
    useful_life_months: 36,
  };

  it('acepta un activo sin serie ni ubicación y rechaza una vida útil de cero', () => {
    expect(saveAssetSchema.parse(valid)).toMatchObject({ serial: null, location: null });
    expect(saveAssetSchema.safeParse({ ...valid, useful_life_months: 0 }).success).toBe(false);
    expect(saveAssetSchema.safeParse({ ...valid, category: 'vehicle' }).success).toBe(false);
    expect(saveAssetSchema.safeParse({ ...valid, cost: '-1' }).success).toBe(false);
  });

  it('exige a quién se asigna, motivo de baja y costo del mantenimiento', () => {
    expect(assignAssetSchema.safeParse({ assigned_on: '2026-11-12' }).success).toBe(false);
    expect(assignAssetSchema.parse({ user_id: ID, assigned_on: '2026-11-12' }).message).toBeNull();
    const retire = { retired_on: '2026-11-12', reason: 'damage', note: 'Pantalla rota' };
    expect(retireAssetSchema.safeParse(retire).success).toBe(true);
    expect(retireAssetSchema.safeParse({ ...retire, reason: 'gift' }).success).toBe(false);
    expect(completeMaintenanceSchema.safeParse({ done_on: '2026-11-12' }).success).toBe(false);
  });
});
