import type { Metadata } from 'next';
import type { JSX } from 'react';

import { ClosingPanel } from '../../../../../features/finance/closing-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Cierre y exportación contable' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['finance.ledger.read']}>
      <ClosingPanel />
    </RequirePermission>
  );
}
