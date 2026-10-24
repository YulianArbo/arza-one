'use client';

import { useState, type JSX } from 'react';

import { cn } from '../lib/cn.js';
import { ChartDataTable } from './data-table.js';
import { linePaths, niceMax, toneColor, xAt, yAt, type ChartTone, type PlotBox } from './scale.js';

export interface LineSeries {
  readonly key: string;
  readonly label: string;
  readonly values: readonly number[];
  readonly tone: ChartTone;
}

export interface LineChartProps {
  /** Qué muestra la gráfica, para el lector de pantalla y la tabla equivalente. */
  readonly title: string;
  readonly labels: readonly string[];
  readonly series: readonly LineSeries[];
  readonly format?: (value: number) => string;
}

const BOX: PlotBox = { left: 44, right: 628, top: 12, bottom: 196 };
const TICKS = [0, 0.25, 0.5, 0.75, 1];

/** Gráfica de líneas con series que se ocultan y valores al pasar el cursor (B22A). */
export function LineChart({ title, labels, series, format = String }: LineChartProps): JSX.Element {
  const [hidden, setHidden] = useState<readonly string[]>([]);
  const visible = series.filter((line) => !hidden.includes(line.key));
  const toggle = (key: string): void => {
    setHidden(hidden.includes(key) ? hidden.filter((item) => item !== key) : [...hidden, key]);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" aria-label="Series" role="group">
        {series.map((line) => (
          <SeriesToggle
            key={line.key}
            line={line}
            on={!hidden.includes(line.key)}
            onToggle={toggle}
          />
        ))}
      </div>
      <Plot title={title} labels={labels} lines={visible} format={format} />
      <ChartDataTable
        caption={title}
        columns={['Periodo', ...series.map((line) => line.label)]}
        rows={labels.map((label, index) => [
          label,
          ...series.map((line) => format(line.values[index] ?? 0)),
        ])}
      />
    </div>
  );
}

interface PlotProps {
  readonly title: string;
  readonly labels: readonly string[];
  readonly lines: readonly LineSeries[];
  readonly format: (value: number) => string;
}

function Plot({ title, labels, lines, format }: PlotProps): JSX.Element {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(lines.flatMap((line) => line.values));
  return (
    <div className="relative">
      <svg
        viewBox="0 0 640 228"
        className="w-full overflow-visible"
        role="img"
        aria-label={title}
        onMouseLeave={() => {
          setHover(null);
        }}
      >
        <Grid max={max} format={format} />
        {lines.map((line) => (
          <Line key={line.key} line={line} max={max} />
        ))}
        <Columns labels={labels} onHover={setHover} />
        {hover === null ? null : (
          <Cursor index={hover} count={labels.length} lines={lines} max={max} />
        )}
      </svg>
      {hover === null ? null : (
        <Tooltip index={hover} labels={labels} lines={lines} format={format} />
      )}
    </div>
  );
}

/** Etiqueta de cada periodo y una franja invisible que, al pasar el cursor, lo señala. */
function Columns(props: {
  readonly labels: readonly string[];
  readonly onHover: (index: number) => void;
}): JSX.Element {
  const count = props.labels.length;
  const step = (BOX.right - BOX.left) / Math.max(count - 1, 1);
  return (
    <g>
      {props.labels.map((label, index) => (
        <g key={label}>
          <text
            x={xAt(index, count, BOX)}
            y={220}
            textAnchor="middle"
            className="fill-muted-foreground text-[11px]"
          >
            {label}
          </text>
          <rect
            data-testid={`columna-${label}`}
            x={xAt(index, count, BOX) - step / 2}
            y={0}
            width={step}
            height={BOX.bottom}
            fill="transparent"
            onMouseEnter={() => {
              props.onHover(index);
            }}
          />
        </g>
      ))}
    </g>
  );
}

function SeriesToggle(props: {
  readonly line: LineSeries;
  readonly on: boolean;
  readonly onToggle: (key: string) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={props.on}
      onClick={() => {
        props.onToggle(props.line.key);
      }}
      className={cn(
        'inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors',
        props.on ? 'bg-muted text-foreground' : 'text-muted-foreground line-through',
      )}
    >
      <span
        aria-hidden="true"
        className="size-2 rounded-sm"
        style={{ background: toneColor(props.line.tone) }}
      />
      {props.line.label}
    </button>
  );
}

function Grid({
  max,
  format,
}: {
  readonly max: number;
  readonly format: (value: number) => string;
}): JSX.Element {
  return (
    <g aria-hidden="true">
      {TICKS.map((tick) => {
        const y = yAt(max * tick, max, BOX);
        return (
          <g key={tick}>
            <line
              x1={BOX.left}
              x2={BOX.right}
              y1={y}
              y2={y}
              className="stroke-border"
              strokeDasharray="3 4"
            />
            <text x={0} y={y + 4} className="fill-muted-foreground text-[11px]">
              {format(max * tick)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function Line({ line, max }: { readonly line: LineSeries; readonly max: number }): JSX.Element {
  const { line: path, area } = linePaths(line.values, max, BOX);
  const color = toneColor(line.tone);
  return (
    <g>
      <path d={area} fill={color} opacity={0.1} />
      <path
        d={path}
        pathLength={1}
        fill="none"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="animate-draw"
      />
    </g>
  );
}

function Cursor(props: {
  readonly index: number;
  readonly count: number;
  readonly lines: readonly LineSeries[];
  readonly max: number;
}): JSX.Element {
  const x = xAt(props.index, props.count, BOX);
  return (
    <g aria-hidden="true">
      <line x1={x} x2={x} y1={BOX.top} y2={BOX.bottom} className="stroke-input" />
      {props.lines.map((line) => (
        <circle
          key={line.key}
          cx={x}
          cy={yAt(line.values[props.index] ?? 0, props.max, BOX)}
          r={5}
          className="fill-card"
          stroke={toneColor(line.tone)}
          strokeWidth={2.5}
        />
      ))}
    </g>
  );
}

function Tooltip(props: {
  readonly index: number;
  readonly labels: readonly string[];
  readonly lines: readonly LineSeries[];
  readonly format: (value: number) => string;
}): JSX.Element {
  const left = (xAt(props.index, props.labels.length, BOX) / 640) * 100;
  const flip = props.index > props.labels.length / 2;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-1 flex w-40 flex-col gap-1 rounded-lg border bg-popover p-2.5 text-xs shadow-lg animate-enter"
      style={{ left: `calc(${String(left)}% ${flip ? '- 172px' : '+ 12px'})` }}
    >
      <span className="font-semibold">{props.labels[props.index]}</span>
      {props.lines.map((line) => (
        <span key={line.key} className="flex justify-between gap-3">
          <span className="text-muted-foreground">{line.label}</span>
          <span className="tabular-nums">{props.format(line.values[props.index] ?? 0)}</span>
        </span>
      ))}
    </div>
  );
}
