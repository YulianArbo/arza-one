'use client';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@arza/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment, type JSX } from 'react';

import { breadcrumbFor } from './navigation';

/** Ruta de navegación de la zona 2 (16.3): Inicio › módulo › submódulo. */
export function AppBreadcrumb(): JSX.Element {
  const items = breadcrumbFor(usePathname());
  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList>
        {items.map((item, index) => (
          <Fragment key={item.href}>
            {index > 0 ? <BreadcrumbSeparator /> : null}
            <BreadcrumbItem>
              {index === items.length - 1 ? (
                <BreadcrumbPage>{item.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link href={item.href}>{item.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
