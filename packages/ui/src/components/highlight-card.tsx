import { useId, type JSX, type ReactNode } from 'react';

import { cn } from '../lib/cn.js';

export interface HighlightCardProps {
  readonly title: string;
  readonly description?: string | undefined;
  /** Destaca la tarjeta con el borde azul de la marca. Clara, nunca con fondo oscuro (B22B). */
  readonly highlighted?: boolean;
  readonly className?: string | undefined;
  readonly children: ReactNode;
}

/** Bloque de contenido con título de sección. La tarjeta destacada lleva borde azul. */
export function HighlightCard({
  title,
  description,
  highlighted = false,
  className,
  children,
}: HighlightCardProps): JSX.Element {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        'flex flex-col gap-3 rounded-xl bg-card p-6 text-card-foreground',
        highlighted ? 'border-2 border-primary' : 'border',
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="font-heading text-card-title font-semibold">
          {title}
        </h2>
        {description ? <p className="text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
