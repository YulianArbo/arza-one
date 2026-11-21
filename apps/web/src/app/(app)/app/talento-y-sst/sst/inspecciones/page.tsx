import type { Metadata } from 'next';
import type { JSX } from 'react';

import { RequirePermission } from '../../../../../../features/session/permissions';
import { SstInspections } from '../../../../../../features/sst/sst-inspections';

export const metadata: Metadata = { title: 'Inspecciones' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['sst.read']}>
      <SstInspections />
    </RequirePermission>
  );
}
