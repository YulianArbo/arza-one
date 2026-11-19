import type { JSX, ReactNode } from 'react';

import { PlainLink, type LinkComponent } from '../lib/link.js';

export interface AttentionItem {
  readonly id: string;
  readonly title: string;
  /** Módulo y vencimiento, por ejemplo «Compras · vence hoy». */
  readonly meta: string;
  readonly href: string;
  readonly icon?: ReactNode;
}

export interface AttentionListProps {
  readonly items: readonly AttentionItem[];
  /** Componente de enlace, por ejemplo el `Link` de Next.js. */
  readonly linkAs?: LinkComponent;
}

/** Flecha que indica que la fila abre el registro. Solo decora. */
function OpenArrow(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="ml-auto size-4 shrink-0 text-muted-foreground"
    >
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}

/** Lista de pendientes: cada fila enlaza al registro que requiere atención. */
export function AttentionList({
  items,
  linkAs: Link = PlainLink,
}: AttentionListProps): JSX.Element {
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li key={item.id} className="border-b last:border-b-0">
          <Link
            href={item.href}
            className="flex items-center gap-3 rounded-md py-3 transition-colors duration-200 hover:bg-accent"
          >
            {item.icon ? (
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4"
              >
                {item.icon}
              </span>
            ) : null}
            <span className="flex min-w-0 flex-col">
              <span className="font-semibold">{item.title}</span>{' '}
              <span className="text-xs text-muted-foreground">{item.meta}</span>
            </span>
            <OpenArrow />
          </Link>
        </li>
      ))}
    </ul>
  );
}
