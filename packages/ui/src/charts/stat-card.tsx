import type { JSX } from 'react';

import { cn } from '../lib/cn.js';
import type { ChartTone } from './scale.js';
import { Sparkline } from './sparkline.js';

export interface StatCardProps {
  readonly label: string;
  readonly value: string;
  /** Cambio frente al periodo anterior, por ejemplo «+12 %». */
  readonly change?: { readonly text: string; readonly favorable: boolean } | undefined;
  readonly note?: string | undefined;
  readonly trend?: readonly number[] | undefined;
  readonly trendLabel?: string;
  readonly tone?: ChartTone;
}

/** Tarjeta de indicador con su cifra, el cambio y la tendencia (16.4). Se invierte al pasar. */
export function StatCard({
  label,
  value,
  change,
  note,
  trend,
  trendLabel = `Tendencia de ${label}`,
  tone = 'action',
}: StatCardProps): JSX.Element {
  return (
    <section className="flex flex-col gap-2 rounded-xl border bg-card p-4 hover-invert">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-normal text-muted-foreground">{label}</h3>
        {change ? (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              change.favorable
                ? 'bg-success/12 text-success'
                : 'bg-destructive/12 text-destructive',
            )}
          >
            {change.text}
          </span>
        ) : null}
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
        {trend && trend.length > 1 ? (
          <Sparkline values={trend} tone={tone} label={trendLabel} />
        ) : null}
      </div>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </section>
  );
}
