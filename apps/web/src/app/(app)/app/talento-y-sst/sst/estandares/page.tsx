import type { Metadata } from 'next';
import type { JSX } from 'react';

import { RequirePermission } from '../../../../../../features/session/permissions';
import { SstStandards } from '../../../../../../features/sst/sst-standards';

export const metadata: Metadata = { title: 'Estándares mínimos' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['sst.read']}>
      <SstStandards />
    </RequirePermission>
  );
}
