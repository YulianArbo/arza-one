import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PurchasesHome } from '../../../../features/purchases/purchases-home';

export const metadata: Metadata = { title: 'Compras' };

export default function PurchasesPage(): JSX.Element {
  return <PurchasesHome />;
}
