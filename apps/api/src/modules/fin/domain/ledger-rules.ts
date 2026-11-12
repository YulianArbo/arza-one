import { Decimal } from 'decimal.js';

// Reglas de Finanzas del B32 que no dependen de la base de datos: el saldo de la caja menor, el
// cuadre de una conciliación y los meses contables.

export const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

type PettyCashType = 'opening' | 'voucher' | 'replenishment';

export type PettyCashProblem =
  'already_open' | 'not_open' | 'insufficient_balance' | 'over_fund' | 'date_before_last';

export interface PettyCashState {
  /** Fondo abierto (valor de la apertura); null si la caja no se ha abierto. */
  readonly fund: string | null;
  readonly balance: string;
  /** Fecha AAAA-MM-DD del último movimiento; null si no hay. */
  readonly lastDate: string | null;
}

export interface PettyCashMove {
  readonly type: PettyCashType;
  readonly amount: string;
  readonly date: string;
}

/**
 * Saldo después del movimiento, o el problema que lo impide. La caja se abre una vez con el fondo;
 * un vale resta y nunca deja el saldo negativo; un reembolso suma y nunca pasa del fondo. Los
 * movimientos van en orden de fecha para que el saldo de cada uno sea cierto.
 */
export function pettyCashBalanceAfter(
  state: PettyCashState,
  move: PettyCashMove,
): { readonly balance: string } | { readonly problem: PettyCashProblem } {
  if (state.lastDate !== null && move.date < state.lastDate) return { problem: 'date_before_last' };
  if (move.type === 'opening') {
    return state.fund === null ? { balance: move.amount } : { problem: 'already_open' };
  }
  if (state.fund === null) return { problem: 'not_open' };
  const amount = new Money(move.amount);
  const current = new Money(state.balance);
  if (move.type === 'voucher') {
    const next = current.minus(amount);
    return next.isNegative() ? { problem: 'insufficient_balance' } : { balance: next.toFixed(2) };
  }
  const next = current.plus(amount);
  return next.greaterThan(state.fund) ? { problem: 'over_fund' } : { balance: next.toFixed(2) };
}

/** Lo que falta por explicar: saldo del banco menos (saldo en libros más las partidas). */
export function unexplainedDifference(
  bookBalance: string,
  bankBalance: string,
  differences: readonly { readonly amount: string }[],
): string {
  const explained = differences.reduce(
    (sum, item) => sum.plus(item.amount),
    new Money(bookBalance),
  );
  return new Money(bankBalance).minus(explained).toFixed(2);
}

/** Mes contable AAAA-MM de una fecha AAAA-MM-DD. */
export function periodOf(date: string): string {
  return date.slice(0, 7);
}

/** Primer y último día (AAAA-MM-DD) de un mes contable. */
export function periodRange(period: string): { readonly from: string; readonly to: string } {
  const [year, month] = period.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, '0')}` };
}

/** Un mes se puede cerrar cuando ya terminó: es anterior al mes de hoy. */
export function isPastPeriod(period: string, today: string): boolean {
  return period < periodOf(today);
}

/** Los últimos `count` meses hasta el de hoy (incluido), del más reciente al más antiguo. */
export function recentPeriods(today: string, count: number): string[] {
  const [year, month] = periodOf(today).split('-').map(Number) as [number, number];
  return Array.from({ length: count }, (_, back) => {
    const date = new Date(Date.UTC(year, month - 1 - back, 1));
    return `${String(date.getUTCFullYear())}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}
