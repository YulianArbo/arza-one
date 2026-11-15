import type { Metadata } from 'next';
import type { JSX } from 'react';

import { FinanceInvoicesPanel } from '../../../../../features/finance/invoices-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Facturas y recaudos' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['finance.invoice.read']}>
      <FinanceInvoicesPanel />
    </RequirePermission>
  );
}
