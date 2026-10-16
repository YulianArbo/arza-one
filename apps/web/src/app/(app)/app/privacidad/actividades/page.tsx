import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { ActivitiesPanel } from '../../../../../features/privacy/activities-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Actividades de tratamiento' };

export default function PrivacyActivitiesPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['privacy.activity.manage']}>
      <PageHeader
        title="Actividades de tratamiento"
        description="El registro de cada uso de datos personales: qué datos, de quiénes, para qué, con qué fundamento, por cuánto tiempo y con qué encargados."
      />
      <ActivitiesPanel />
    </RequirePermission>
  );
}
