import type { Metadata } from 'next';
import type { JSX } from 'react';

import { TravelPanel } from '../../../../../features/purchases/travel-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Viajes y legalizaciones' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['purchase.read', 'purchase.travel.request']}>
      <TravelPanel />
    </RequirePermission>
  );
}
