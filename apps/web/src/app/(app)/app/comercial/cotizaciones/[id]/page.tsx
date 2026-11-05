import type { Metadata } from 'next';
import type { JSX } from 'react';

import { QuoteDetailPanel } from '../../../../../../features/crm/quote-detail';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Ficha de la cotización' };

interface QuotePageProps {
  params: Promise<{ id: string }>;
}

export default async function QuotePage({ params }: QuotePageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['crm.quote.read']}>
      <QuoteDetailPanel id={id} />
    </RequirePermission>
  );
}
