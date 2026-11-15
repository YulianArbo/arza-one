import type { Metadata } from 'next';
import type { JSX } from 'react';

import { ComparisonPanel } from '../../../../../features/purchases/comparison-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Cuadro comparativo' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['purchase.read']}>
      <ComparisonPanel />
    </RequirePermission>
  );
}
