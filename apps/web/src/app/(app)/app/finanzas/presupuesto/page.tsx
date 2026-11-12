import type { Metadata } from 'next';
import type { JSX } from 'react';

import { BudgetsPanel } from '../../../../../features/finance/budgets-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Presupuesto' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['finance.budget.read']}>
      <BudgetsPanel />
    </RequirePermission>
  );
}
