import type { Metadata } from 'next';
import type { JSX } from 'react';

import { RequirePermission } from '../../../../../features/session/permissions';
import { QuickReport } from '../../../../../features/sst/quick-report';

export const metadata: Metadata = { title: 'Reportar a SST' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['sst.incident.report']}>
      <QuickReport />
    </RequirePermission>
  );
}
