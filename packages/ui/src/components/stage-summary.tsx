import type { JSX, ReactNode } from 'react';

import { cn } from '../lib/cn.js';
import { PlainLink, type LinkComponent } from '../lib/link.js';

export interface Stage {
  readonly key: string;
  /** Qué se hace en la etapa, por ejemplo «Evaluar la necesidad». */
  readonly label: string;
  readonly count: number;
  /** Qué se cuenta, por ejemplo «Solicitudes». */
  readonly caption: string;
  readonly href: string;
  readonly icon?: ReactNode;
}

export interface StageSummaryProps {
  /** Nombre del recorrido para el lector de pantalla, por ejemplo «Etapas de compras». */
  readonly label: string;
  readonly stages: readonly Stage[];
  /** Etapa resaltada con borde azul; el azul de acción queda para la acción principal. */
  readonly current?: string | undefined;
  readonly linkAs?: LinkComponent;
}

const COUNT = new Intl.NumberFormat('es-CO');

interface StageLinkProps {
  readonly stage: Stage;
  readonly isCurrent: boolean;
  readonly Link: LinkComponent;
}

/** Una etapa: qué se hace, cuántos registros hay y qué se cuenta. */
function StageLink({ stage, isCurrent, Link }: StageLinkProps): JSX.Element {
  return (
    <Link
      href={stage.href}
      aria-current={isCurrent ? 'step' : undefined}
      className={cn(
        'flex h-full flex-col gap-1 p-4 transition-colors duration-200 hover:bg-accent',
        isCurrent && 'inset-ring-2 inset-ring-primary',
      )}
    >
      <span
        className={cn(
          'flex items-center gap-2 text-xs [&_svg]:size-4',
          isCurrent ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        {stage.icon ? <span aria-hidden="true">{stage.icon}</span> : null}
        {stage.label}
      </span>
      <span className="text-3xl font-semibold tabular-nums">{COUNT.format(stage.count)}</span>
      <span>{stage.caption}</span>
    </Link>
  );
}

/** Recorrido de un módulo por etapas, con la cantidad de registros en cada una (B22B). */
export function StageSummary({
  label,
  stages,
  current,
  linkAs: Link = PlainLink,
}: StageSummaryProps): JSX.Element {
  return (
    <nav aria-label={label}>
      <ol className="grid overflow-hidden rounded-xl border bg-card sm:grid-cols-2 lg:grid-cols-4">
        {stages.map((stage) => (
          <li key={stage.key} className="border-b sm:border-r lg:border-b-0 lg:last:border-r-0">
            <StageLink stage={stage} isCurrent={stage.key === current} Link={Link} />
          </li>
        ))}
      </ol>
    </nav>
  );
}
