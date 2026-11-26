import type { Metadata } from 'next';
import type { JSX } from 'react';

import { DirectionHome } from '../../../../features/direction/direction-home';
import { RequirePermission } from '../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Dirección' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission
      anyOf={['dashboard.executive.read', 'dashboard.process.read', 'dashboard.compliance.read']}
    >
      <DirectionHome />
    </RequirePermission>
  );
}
