import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { CatalogsPanel } from '../../../../../features/organization/catalogs-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Catálogos' };

export default function CatalogsPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['core.parameter.read']}>
      <PageHeader
        title="Catálogos"
        description="Las listas que usan los formularios. Una opción usada no se borra: se inactiva."
      />
      <CatalogsPanel />
    </RequirePermission>
  );
}
