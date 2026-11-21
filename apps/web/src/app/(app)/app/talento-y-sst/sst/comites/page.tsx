import type { Metadata } from 'next';
import type { JSX } from 'react';

import { RequirePermission } from '../../../../../../features/session/permissions';
import { SstCommittees } from '../../../../../../features/sst/sst-committees';

export const metadata: Metadata = { title: 'Comités' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['sst.incident.report', 'sst.committee.read']}>
      <SstCommittees />
    </RequirePermission>
  );
}
