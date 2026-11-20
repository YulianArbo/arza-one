'use client';

import { QuickLinks } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { visibleSubmodules } from '../../components/app-shell/submodules';
import { usePermissions } from '../session/permissions';
import { MASTER_LIST_PATH } from './labels';

/**
 * «También en Documentos» (B22B, boceto 13): registros, formatos, solicitudes, retención y
 * disposición, solo los que la persona puede abrir. El Listado Maestro va en el encabezado.
 */
export function DocumentsAlso(): JSX.Element | null {
  const { granted, grantedAll } = usePermissions();
  const links = visibleSubmodules('documentos', granted, grantedAll)
    .filter((entry) => entry.href !== MASTER_LIST_PATH)
    .map((entry) => ({ href: entry.href, label: entry.label, icon: <entry.icon /> }));
  if (links.length === 0) return null;
  return <QuickLinks title="También en Documentos" links={links} linkAs={Link} />;
}
