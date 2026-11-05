import type { JSX } from 'react';

import { ChartDataTable } from './data-table.js';

export interface FunnelStep {
  readonly label: string;
  readonly value: number;
  /** Texto de la cifra, por ejemplo «$ 64,0 M». */
  readonly display: string;
}

export interface FunnelBarsProps {
  readonly title: string;
  readonly steps: readonly FunnelStep[];
}

/** Embudo en barras horizontales, de la etapa más grande a la más pequeña (B22A). */
export function FunnelBars({ title, steps }: FunnelBarsProps): JSX.Element {
  const max = Math.max(...steps.map((step) => step.value), 1);
  return (
    <div className="flex flex-col gap-3">
      <ol aria-label={title} className="flex flex-col gap-2.5">
        {steps.map((step, index) => (
          <li key={step.label} className="flex flex-col gap-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{step.label}</span>
              <span className="tabular-nums">{step.display}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-action animate-fill"
                style={{
                  width: `${String((step.value * 100) / max)}%`,
                  opacity: 1 - index * 0.15,
                  animationDelay: `${String(index * 80)}ms`,
                }}
              />
            </div>
          </li>
        ))}
      </ol>
      <ChartDataTable
        caption={title}
        columns={['Etapa', 'Valor']}
        rows={steps.map((step) => [step.label, step.display])}
      />
    </div>
  );
}
