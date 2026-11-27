import type { Metadata } from 'next';
import type { JSX } from 'react';

import { ExecutivePage } from '../../../../../features/direction/direction-home';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Tablero gerencial' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['dashboard.executive.read']}>
      <ExecutivePage />
    </RequirePermission>
  );
}
