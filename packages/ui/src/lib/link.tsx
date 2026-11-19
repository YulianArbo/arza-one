import type { ComponentType, ReactNode } from 'react';

/** Propiedades mínimas de un enlace. Permite usar el `Link` de Next.js sin depender de él. */
export interface LinkProps {
  readonly href: string;
  readonly className?: string;
  readonly 'aria-current'?: 'step' | 'page' | undefined;
  readonly children: ReactNode;
}

export type LinkComponent = ComponentType<LinkProps>;

/** Enlace por defecto: un `<a>` común. */
export function PlainLink({ href, className, children, ...rest }: LinkProps): ReactNode {
  return (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  );
}
