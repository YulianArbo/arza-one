import type { Metadata } from 'next';
import type { JSX } from 'react';

import { RequestsPanel } from '../../../../../features/purchases/requests-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Solicitudes de compra' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['purchase.read', 'purchase.request.create']}>
      <RequestsPanel />
    </RequirePermission>
  );
}
