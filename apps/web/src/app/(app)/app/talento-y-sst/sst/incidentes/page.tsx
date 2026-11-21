import type { Metadata } from 'next';
import type { JSX } from 'react';

import { RequirePermission } from '../../../../../../features/session/permissions';
import { SstIncidents } from '../../../../../../features/sst/sst-incidents';

export const metadata: Metadata = { title: 'Incidentes y reportes' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['sst.read']}>
      <SstIncidents />
    </RequirePermission>
  );
}
