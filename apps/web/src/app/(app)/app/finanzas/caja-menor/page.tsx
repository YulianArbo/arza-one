import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PettyCashPanel } from '../../../../../features/finance/petty-cash-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Caja menor' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['finance.ledger.read']}>
      <PettyCashPanel />
    </RequirePermission>
  );
}
