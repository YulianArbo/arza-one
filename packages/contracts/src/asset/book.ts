import { moneyToCents } from '../purchase/tiers.js';
import { ASSET_CATEGORIES, ASSET_STATUS, type Asset } from './assets.js';

// Libro de activos (B34, RE-ADM-003): la depreciación informativa en línea recta y el archivo
// que se descarga. Las columnas son una propuesta por validar contra el formato original.

/** Meses completos entre dos fechas AAAA-MM-DD; cero si la segunda es anterior. */
export function fullMonthsBetween(from: string, to: string): number {
  const [fromYear = 0, fromMonth = 0, fromDay = 0] = from.split('-').map(Number);
  const [toYear = 0, toMonth = 0, toDay = 0] = to.split('-').map(Number);
  const months = (toYear - fromYear) * 12 + (toMonth - fromMonth) - (toDay < fromDay ? 1 : 0);
  return Math.max(0, months);
}

function centsToMoney(cents: bigint): string {
  return `${String(cents / 100n)}.${String(cents % 100n).padStart(2, '0')}`;
}

export interface Depreciation {
  readonly accumulated: string;
  readonly bookValue: string;
}

/**
 * Depreciación en línea recta a una fecha: el costo repartido por igual en los meses de vida
 * útil, contando meses completos desde la compra y sin pasar del costo.
 */
export function straightLineDepreciation(
  asset: {
    readonly cost: string;
    readonly purchaseDate: string;
    readonly usefulLifeMonths: number;
  },
  asOf: string,
): Depreciation {
  const cost = moneyToCents(asset.cost);
  const months = Math.min(fullMonthsBetween(asset.purchaseDate, asOf), asset.usefulLifeMonths);
  const accumulated = (cost * BigInt(months)) / BigInt(asset.usefulLifeMonths);
  return { accumulated: centsToMoney(accumulated), bookValue: centsToMoney(cost - accumulated) };
}

export const ASSET_BOOK_COLUMNS = [
  'Código',
  'Nombre',
  'Categoría',
  'Serie',
  'Fecha de compra',
  'Costo',
  'Vida útil (meses)',
  'Depreciación acumulada',
  'Valor en libros',
  'Estado',
  'Ubicación',
  'Responsable',
  'Fecha de asignación',
  'Comodato',
  'Fecha de baja',
] as const;

/** 2026-11-12 → 12/11/2026, como se muestran las fechas en Colombia. */
function displayDate(date: string | null): string {
  if (date === null) return '';
  const [year = '', month = '', day = ''] = date.split('-');
  return `${day}/${month}/${year}`;
}

function csvCell(value: string): string {
  // Una celda que empieza con =, +, - o @ se guarda como texto: una hoja de cálculo no la ejecuta.
  const safe = /^[=+\-@]/u.test(value) ? `'${value}` : value;
  return /[";\n\r]/u.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** Coma decimal, como la lee la hoja de cálculo en Colombia. */
function csvMoney(amount: string): string {
  return amount.replace('.', ',');
}

function bookRow(asset: Asset): string[] {
  const active = asset.assignment?.status === 'active' ? asset.assignment : null;
  return [
    asset.code,
    asset.name,
    ASSET_CATEGORIES[asset.category],
    asset.serial ?? '',
    displayDate(asset.purchase_date),
    csvMoney(asset.cost),
    String(asset.useful_life_months),
    csvMoney(asset.accumulated_depreciation),
    csvMoney(asset.book_value),
    ASSET_STATUS[asset.status],
    asset.location ?? '',
    active?.holder.name ?? '',
    displayDate(active?.assigned_on ?? null),
    active?.record_code ?? '',
    displayDate(asset.retired_on),
  ];
}

/** Marca de orden de bytes: la hoja de cálculo reconoce el archivo como UTF-8. */
const BOM = '\uFEFF';

/** El libro como CSV con punto y coma y marca de orden, para abrirlo en una hoja de cálculo. */
export function assetBookCsv(assets: readonly Asset[]): string {
  const lines = [[...ASSET_BOOK_COLUMNS], ...assets.map(bookRow)];
  return `${BOM}${lines.map((line) => line.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

/** libro-de-activos-2026-11-12.csv */
export function assetBookFileName(today: string): string {
  return `libro-de-activos-${today}.csv`;
}
