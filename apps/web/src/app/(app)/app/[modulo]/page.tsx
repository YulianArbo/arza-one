import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { JSX } from 'react';

import { findNavigationItem } from '../../../../components/app-shell/navigation';
import { ModulePage as ModuleScreen } from '../../../../features/modules/module-page';

interface ModulePageProps {
  params: Promise<{ modulo: string }>;
}

export async function generateMetadata({ params }: ModulePageProps): Promise<Metadata> {
  const item = findNavigationItem((await params).modulo);
  return { title: item?.label ?? 'Página no encontrada' };
}

/** Módulos del menú que todavía no se han construido. */
export default async function ModulePage({ params }: ModulePageProps): Promise<JSX.Element> {
  const item = findNavigationItem((await params).modulo);
  if (!item?.block) {
    notFound();
  }
  return <ModuleScreen slug={item.slug} />;
}
