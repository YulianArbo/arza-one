import type { Metadata } from 'next';
import type { JSX } from 'react';

import { CompliancePage } from '../../../../../features/direction/direction-home';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Tablero de cumplimiento' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['dashboard.compliance.read']}>
      <CompliancePage />
    </RequirePermission>
  );
}
