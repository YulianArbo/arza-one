import Link from 'next/link';
import type { JSX } from 'react';

/** Enlace de texto entre pantallas de acceso. */
export function AccessLink({
  href,
  children,
}: {
  readonly href: string;
  readonly children: string;
}): JSX.Element {
  return (
    <Link href={href} className="text-sm text-primary underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}
