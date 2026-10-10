'use client';

import type { JSX } from 'react';

import { findNavigationItem } from '../../components/app-shell/navigation';
import { usePermissions } from '../session/permissions';
import { ModulePlaceholder } from './module-placeholder';

/** Pantalla de un módulo del menú aún no construido, con los permisos de la persona. */
export function ModulePage({ slug }: { readonly slug: string }): JSX.Element | null {
  const item = findNavigationItem(slug);
  const permissions = usePermissions();
  if (item === undefined || !permissions.ready) return null;
  return <ModulePlaceholder item={item} granted={permissions.granted} />;
}
