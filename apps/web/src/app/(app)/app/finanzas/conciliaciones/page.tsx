import type { Metadata } from 'next';
import type { JSX } from 'react';

import { ReconciliationsPanel } from '../../../../../features/finance/reconciliations-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Conciliación bancaria' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['finance.ledger.read']}>
      <ReconciliationsPanel />
    </RequirePermission>
  );
}
