import type { Metadata } from 'next';
import type { JSX } from 'react';

import { RequirePermission } from '../../../../../../features/session/permissions';
import { SstHealth } from '../../../../../../features/sst/sst-health';

export const metadata: Metadata = { title: 'Salud y protección' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['sst.read']}>
      <SstHealth />
    </RequirePermission>
  );
}
