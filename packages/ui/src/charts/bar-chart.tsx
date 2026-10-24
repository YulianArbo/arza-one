import type { JSX } from 'react';

import { ChartDataTable } from './data-table.js';
import { niceMax, toneColor, type ChartTone } from './scale.js';

export interface BarItem {
  readonly label: string;
  readonly value: number;
  readonly tone?: ChartTone;
}

export interface BarChartProps {
  readonly title: string;
  readonly items: readonly BarItem[];
  readonly format?: (value: number) => string;
}

const HEIGHT = 140;
const SLOT = 64;
const BAR = SLOT - 28;

interface BarProps {
  readonly item: BarItem;
  readonly index: number;
  readonly max: number;
  readonly format: (value: number) => string;
}

function Bar({ item, index, max, format }: BarProps): JSX.Element {
  const height = (HEIGHT * item.value) / max;
  const x = index * SLOT + 14;
  const center = x + BAR / 2;
  return (
    <g className="transition-opacity group-hover/bars:opacity-45 hover:opacity-100!">
      <rect
        x={x}
        y={HEIGHT + 6 - height}
        width={BAR}
        height={height}
        rx={5}
        fill={toneColor(item.tone ?? 'action')}
        className="animate-grow"
        style={{ animationDelay: `${String(index * 60)}ms` }}
      />
      <text
        x={center}
        y={HEIGHT - height}
        textAnchor="middle"
        className="fill-foreground text-[11px] font-semibold"
      >
        {format(item.value)}
      </text>
      <text x={center} y={174} textAnchor="middle" className="fill-muted-foreground text-[10.5px]">
        {item.label}
      </text>
    </g>
  );
}

/** Barras verticales; al pasar el cursor por una, las demás se atenúan (B22A). */
export function BarChart({ title, items, format = String }: BarChartProps): JSX.Element {
  const max = niceMax(items.map((item) => item.value));
  const width = Math.max(items.length * SLOT, SLOT);
  return (
    <div className="flex flex-col gap-3">
      <svg
        viewBox={`0 0 ${String(width)} 180`}
        className="group/bars mx-auto h-auto w-full"
        style={{ maxWidth: width * 1.15 }}
        role="img"
        aria-label={title}
      >
        <line x1={0} x2={width} y1={HEIGHT + 6} y2={HEIGHT + 6} className="stroke-border" />
        {items.map((item, index) => (
          <Bar key={item.label} item={item} index={index} max={max} format={format} />
        ))}
      </svg>
      <ChartDataTable
        caption={title}
        columns={['Concepto', 'Valor']}
        rows={items.map((item) => [item.label, format(item.value)])}
      />
    </div>
  );
}
