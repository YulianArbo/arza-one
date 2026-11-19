import type { JSX, ReactNode } from 'react';

export interface PageHeaderProps {
  readonly title: string;
  readonly description?: string | undefined;
  /** Acción principal de la pantalla, por ejemplo «Nueva solicitud». Una sola (B22A). */
  readonly action?: ReactNode;
  /** Línea breve sobre el título, por ejemplo el saludo del día. */
  readonly eyebrow?: ReactNode;
  /** Contenido corto bajo la descripción, por ejemplo el mensaje del día. */
  readonly children?: ReactNode;
}

/**
 * Encabezado de página (figura 16.3, zona 3) con la jerarquía de B22B: título grande que crece
 * con la pantalla, descripción y la acción principal a la derecha, separados del contenido por un
 * borde fino.
 */
export function PageHeader({
  title,
  description,
  action,
  eyebrow,
  children,
}: PageHeaderProps): JSX.Element {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
      <div className="flex min-w-0 flex-col gap-2">
        {eyebrow ? <div className="text-sm text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="font-heading text-title font-semibold text-balance">{title}</h1>
        {description ? <p className="text-muted-foreground">{description}</p> : null}
        {children}
      </div>
      {action}
    </div>
  );
}
