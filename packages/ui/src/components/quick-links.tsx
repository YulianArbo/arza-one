import { useId, type JSX, type ReactNode } from 'react';

import { PlainLink, type LinkComponent } from '../lib/link.js';
import { buttonVariants } from './button.js';

export interface QuickLink {
  readonly href: string;
  readonly label: string;
  readonly icon?: ReactNode;
}

export interface QuickLinksProps {
  /** Título de la sección, por ejemplo «También en Compras». */
  readonly title: string;
  readonly links: readonly QuickLink[];
  readonly linkAs?: LinkComponent;
}

/** Accesos a las demás funciones del módulo, cada uno con su ícono y su nombre. */
export function QuickLinks({
  title,
  links,
  linkAs: Link = PlainLink,
}: QuickLinksProps): JSX.Element {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} className="font-heading text-card-title font-semibold">
        {title}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className={buttonVariants({ variant: 'outline', size: 'lg' })}>
              {link.icon ? <span aria-hidden="true">{link.icon}</span> : null}
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
