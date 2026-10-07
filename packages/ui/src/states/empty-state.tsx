import { Inbox } from 'lucide-react';
import type { JSX, ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  /** Explica qué se verá allí cuando haya datos. */
  description: string;
  /** Botón para crear el primer registro, cuando aplica. */
  action?: ReactNode;
  icon?: ReactNode;
}

/** Estado vacío: explica qué se verá y, si aplica, invita a crear el primero (16.5). */
export function EmptyState({ title, description, action, icon }: EmptyStateProps): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
      <span className="text-muted-foreground [&_svg]:size-8" aria-hidden="true">
        {icon ?? <Inbox />}
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}
