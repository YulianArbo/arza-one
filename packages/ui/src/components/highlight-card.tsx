import { useId, type JSX, type ReactNode } from 'react';

import { cn } from '../lib/cn.js';

export interface HighlightCardProps {
  readonly title: string;
  readonly description?: string | undefined;
  readonly className?: string | undefined;
  readonly children: ReactNode;
}

/**
 * Bloque de contenido con título de sección. Todas llevan el mismo borde fino; el borde azul de
 * la marca aparece solo mientras la persona selecciona algo dentro de la tarjeta (B49, decisión
 * del propietario del 27/11/2026: nunca un recuadro azul fijo).
 */
export function HighlightCard({
  title,
  description,
  className,
  children,
}: HighlightCardProps): JSX.Element {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        'flex flex-col gap-3 rounded-xl border bg-card p-6 text-card-foreground transition-colors duration-200 focus-within:border-primary',
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
