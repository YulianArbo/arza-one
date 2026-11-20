'use client';

import type { JSX, ReactNode } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { RequirePermission } from '../session/permissions';
import { CrmNav } from './crm-nav';

// Marco de las pantallas de Comercial (B22): permiso, título, secciones y contenido.

export function CrmScreen(props: {
  readonly anyOf: readonly string[];
  readonly title: string;
  readonly description: string;
  /** Acción del encabezado, por ejemplo «Cotizaciones» en el embudo (B22B). */
  readonly action?: ReactNode;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <RequirePermission anyOf={props.anyOf}>
      <div className="flex flex-col gap-5">
        <PageHeader title={props.title} description={props.description} action={props.action} />
        <CrmNav />
        {props.children}
      </div>
    </RequirePermission>
  );
}
