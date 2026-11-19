'use client';

import { buttonVariants } from '@arza/ui';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { JSX } from 'react';

import { hrefFor, parentModuleFor } from './navigation';

/** «Volver a [módulo]» junto a la ruta (B22B). Solo aparece en las páginas internas. */
export function BackToModule(): JSX.Element | null {
  const parent = parentModuleFor(usePathname());
  if (!parent) {
    return null;
  }
  return (
    <Link
      href={hrefFor(parent)}
      className={buttonVariants({ variant: 'outline', size: 'sm', className: 'shrink-0' })}
    >
      <ArrowLeft aria-hidden="true" />
      Volver a {parent.label}
    </Link>
  );
}
