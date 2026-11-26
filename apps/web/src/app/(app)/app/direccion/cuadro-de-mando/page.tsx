import type { Metadata } from 'next';
import type { JSX } from 'react';

import { ScorecardPage } from '../../../../../features/direction/direction-home';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Cuadro de mando' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['dashboard.process.read']}>
      <ScorecardPage />
    </RequirePermission>
  );
}
