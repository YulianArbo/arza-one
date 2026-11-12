import type { Metadata } from 'next';
import type { JSX } from 'react';

import { OrdersPanel } from '../../../../../features/purchases/orders-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Órdenes de compra' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['purchase.read']}>
      <OrdersPanel />
    </RequirePermission>
  );
}
