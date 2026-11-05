import type { Metadata } from 'next';
import type { JSX } from 'react';

import { FinanceHome } from '../../../../features/finance/finance-home';

export const metadata: Metadata = { title: 'Finanzas' };

export default function FinancePage(): JSX.Element {
  return <FinanceHome />;
}
