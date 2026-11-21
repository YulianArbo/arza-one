import type { Metadata } from 'next';
import type { JSX } from 'react';

import { RequirePermission } from '../../../../../../features/session/permissions';
import { SstHazards } from '../../../../../../features/sst/sst-planning';

export const metadata: Metadata = { title: 'Matriz de peligros' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['sst.read']}>
      <SstHazards />
    </RequirePermission>
  );
}
