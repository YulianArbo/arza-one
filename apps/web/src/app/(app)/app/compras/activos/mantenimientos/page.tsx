import type { Metadata } from 'next';
import type { JSX } from 'react';

import { MaintenancePanel } from '../../../../../../features/assets/maintenance-panel';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Mantenimientos de activos' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['asset.read']}>
      <MaintenancePanel />
    </RequirePermission>
  );
}
