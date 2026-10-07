import type { JSX, ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Acción principal de la pantalla, por ejemplo «Nueva oportunidad». */
  action?: ReactNode;
}

/** Zona 3 de la figura 16.3: título de la página y acción principal. */
export function PageHeader({ title, description, action }: PageHeaderProps): JSX.Element {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold">{title}</h1>
        {description ? <p className="text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
