import type { Metadata } from 'next';
import type { JSX } from 'react';

import { ReceiptsPanel } from '../../../../../features/purchases/receipts-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Recepciones' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['purchase.read']}>
      <ReceiptsPanel />
    </RequirePermission>
  );
}
