'use client';

import { useState, type JSX } from 'react';

import { ChartDataTable } from './data-table.js';
import { toneColor, type ChartTone } from './scale.js';

export interface DonutItem {
  readonly label: string;
  readonly value: number;
  readonly tone: ChartTone;
}

export interface DonutChartProps {
  readonly title: string;
  readonly items: readonly DonutItem[];
  /** Cifra del centro cuando no se señala ninguna parte, por ejemplo «68 % vigentes». */
  readonly summary: { readonly value: string; readonly label: string };
}

const RADIUS = 60;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface Arc extends DonutItem {
  readonly offset: number;
  readonly length: number;
}

/** Largo y punto de inicio de cada parte sobre la circunferencia. */
function arcs(items: readonly DonutItem[], total: number): readonly Arc[] {
  let offset = 0;
  return items.map((item) => {
    const length = (CIRCUMFERENCE * item.value) / total;
    const arc = { ...item, offset, length };
    offset += length;
    return arc;
  });
}

function Legend({ items }: { readonly items: readonly DonutItem[] }): JSX.Element {
  return (
    <ul className="grid grid-cols-2 gap-1.5 text-sm">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-[3px]"
            style={{ background: toneColor(item.tone) }}
          />
          <span className="flex-1 text-muted-foreground">{item.label}</span>
          <span className="tabular-nums">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

interface RingProps {
  readonly title: string;
  readonly segments: readonly Arc[];
  readonly active: number | null;
  readonly onActive: (index: number | null) => void;
}

function Ring({ title, segments, active, onActive }: RingProps): JSX.Element {
  return (
    <svg
      viewBox="0 0 160 160"
      className="size-36 shrink-0 -rotate-90"
      role="img"
      aria-label={title}
      onMouseLeave={() => {
        onActive(null);
      }}
    >
      <circle cx={80} cy={80} r={RADIUS} fill="none" className="stroke-muted" strokeWidth={18} />
      {segments.map((segment, index) => (
        <circle
          key={segment.label}
          cx={80}
          cy={80}
          r={RADIUS}
          fill="none"
          stroke={toneColor(segment.tone)}
          strokeWidth={active === index ? 24 : 18}
          strokeDasharray={`${String(Math.max(segment.length - 2, 0))} ${String(CIRCUMFERENCE)}`}
          strokeDashoffset={-segment.offset}
          opacity={active === null || active === index ? 1 : 0.35}
          className="cursor-pointer transition-all duration-200"
          onMouseEnter={() => {
            onActive(index);
          }}
        />
      ))}
    </svg>
  );
}

/** Gráfica circular; al señalar una parte, el centro muestra su valor y su porcentaje (B22A). */
export function DonutChart({ title, items, summary }: DonutChartProps): JSX.Element {
  const [active, setActive] = useState<number | null>(null);
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  const selected = active === null ? null : items[active];
  const center = selected
    ? {
        value: String(selected.value),
        label: `${selected.label} · ${String(Math.round((selected.value * 100) / total))} %`,
      }
    : summary;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <Ring title={title} segments={arcs(items, total)} active={active} onActive={setActive} />
        <div aria-live="polite" className="flex flex-col">
          <span className="text-3xl font-semibold tracking-tight tabular-nums">{center.value}</span>
          <span className="text-sm text-muted-foreground">{center.label}</span>
        </div>
      </div>
      <Legend items={items} />
      <ChartDataTable
        caption={title}
        columns={['Estado', 'Cantidad']}
        rows={items.map((item) => [item.label, String(item.value)])}
      />
    </div>
  );
}
