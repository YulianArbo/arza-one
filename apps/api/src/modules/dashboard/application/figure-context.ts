import { Decimal } from 'decimal.js';

import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

// Piezas comunes de los tableros de la Dirección (B46): lo que necesita cada cifra para
// calcularse, lo que devuelve (el valor y los registros que lo originan) y el formato colombiano
// de las celdas del detalle (fechas dd/mm/aaaa y pesos con $).

export interface FigureContext {
  readonly tx: TenantTransaction;
  readonly principal: Principal;
  readonly ability: AppAbility;
  readonly now: Date;
  /** Fecha de hoy en Colombia (AAAA-MM-DD). */
  readonly today: string;
  /** Calcula una sola vez lo que comparten varias cifras (por ejemplo, la cartera). */
  readonly once: <T>(key: string, load: () => Promise<T>) => Promise<T>;
}

export interface FigureColumn {
  readonly key: string;
  readonly label: string;
}

export interface FigureRow {
  readonly id: string;
  readonly cells: Readonly<Record<string, string>>;
}

export interface FigureResult {
  readonly value: string | null;
  readonly detail: string | null;
  readonly columns: readonly FigureColumn[];
  readonly rows: readonly FigureRow[];
}

export type FigureSource = (context: FigureContext) => Promise<FigureResult>;

export function memo(): FigureContext['once'] {
  const cache = new Map<string, Promise<unknown>>();
  return <T>(key: string, load: () => Promise<T>): Promise<T> => {
    const known = cache.get(key);
    if (known !== undefined) return known as Promise<T>;
    const loading = load();
    cache.set(key, loading);
    return loading;
  };
}

/** AAAA-MM-DD como dd/mm/aaaa. */
export function shownDate(date: string | null): string {
  if (date === null) return '';
  const [year, month, day] = date.slice(0, 10).split('-');
  return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

/** Fecha y hora en Colombia como dd/mm/aaaa. */
export function shownBogotaDate(iso: string | null): string {
  if (iso === null) return '';
  const date = new Date(new Date(iso).getTime() - 5 * 60 * 60 * 1000);
  return shownDate(date.toISOString());
}

/** Pesos sin centavos, con punto de miles: $ 1.234.567. Los negativos llevan el signo. */
export function shownPesos(value: string): string {
  const rounded = new Decimal(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const digits = rounded
    .abs()
    .toFixed(0)
    .replace(/\B(?=(\d{3})+(?!\d))/gu, '.');
  return `${rounded.isNegative() ? '-' : ''}$ ${digits}`;
}

/** «12 registros», «1 registro». */
export function countDetail(count: number, singular: string, plural: string): string {
  return `${String(count)} ${count === 1 ? singular : plural}`;
}
