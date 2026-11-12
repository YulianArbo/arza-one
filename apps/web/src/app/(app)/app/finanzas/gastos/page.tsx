import type { Metadata } from 'next';
import type { JSX } from 'react';

import { ExpensesPanel } from '../../../../../features/finance/expenses-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Gastos' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['finance.ledger.read', 'finance.expense.manage']}>
      <ExpensesPanel />
    </RequirePermission>
  );
}
