import type { JSX } from 'react';

import { linePaths, toneColor, type ChartTone } from './scale.js';

export interface SparklineProps {
  readonly values: readonly number[];
  readonly tone?: ChartTone;
  /** Qué muestra la tendencia, para el lector de pantalla. */
  readonly label: string;
}

const BOX = { left: 1, right: 99, top: 3, bottom: 29 };

/** Mini gráfica de tendencia de un indicador (B22A). */
export function Sparkline({ values, tone = 'action', label }: SparklineProps): JSX.Element {
  const min = Math.min(...values);
  const shifted = values.map((value) => value - min);
  const { line, area } = linePaths(shifted, Math.max(...shifted, 1), BOX);
  const color = toneColor(tone);
  return (
    <svg
      viewBox="0 0 100 30"
      className="h-8 w-24 shrink-0 overflow-visible"
      role="img"
      aria-label={label}
    >
      <path d={area} fill={color} opacity={0.12} />
      <path
        d={line}
        pathLength={1}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="animate-draw"
      />
    </svg>
  );
}
