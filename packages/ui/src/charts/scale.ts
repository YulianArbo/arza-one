// Cálculos de las gráficas (B22A): escalas y trazos SVG, sin librerías externas.

export type ChartTone = 'action' | 'primary' | 'success' | 'warning' | 'destructive' | 'muted';

const TONE_COLORS: Record<ChartTone, string> = {
  action: 'var(--action)',
  primary: 'var(--primary)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  destructive: 'var(--destructive)',
  muted: 'var(--muted-foreground)',
};

/** Color CSS de un tono; los tonos salen de los tokens, así siguen el modo claro u oscuro. */
export function toneColor(tone: ChartTone): string {
  return TONE_COLORS[tone];
}

/** Máximo redondeado hacia arriba a 1, 2, 2,5 o 5 por potencia de 10, para la escala. */
export function niceMax(values: readonly number[]): number {
  const max = Math.max(0, ...values);
  if (max === 0) return 1;
  const power = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * power >= max) ?? 10;
  return step * power;
}

export interface PlotBox {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** Posición horizontal del punto i de n dentro de la caja. */
export function xAt(index: number, count: number, box: PlotBox): number {
  if (count <= 1) return (box.left + box.right) / 2;
  return box.left + ((box.right - box.left) * index) / (count - 1);
}

/** Posición vertical de un valor entre 0 y max. */
export function yAt(value: number, max: number, box: PlotBox): number {
  return box.bottom - ((box.bottom - box.top) * value) / max;
}

/** Trazo de la línea y del área bajo ella. */
export function linePaths(
  values: readonly number[],
  max: number,
  box: PlotBox,
): { readonly line: string; readonly area: string } {
  const points = values.map((value, index) => [
    xAt(index, values.length, box).toFixed(1),
    yAt(value, max, box).toFixed(1),
  ]);
  const line = points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x ?? ''} ${y ?? ''}`)
    .join(' ');
  const first = points[0]?.[0] ?? String(box.left);
  const last = points.at(-1)?.[0] ?? String(box.right);
  return { line, area: `${line} L${last} ${String(box.bottom)} L${first} ${String(box.bottom)} Z` };
}

const NUMBER = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

/** Cifra en formato colombiano («1.500», «0,5»): el formato por omisión de las gráficas. */
export function formatNumber(value: number): string {
  return NUMBER.format(value);
}
