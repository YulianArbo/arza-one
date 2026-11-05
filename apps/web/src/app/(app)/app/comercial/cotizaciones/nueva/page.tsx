import type { Metadata } from 'next';
import type { JSX } from 'react';

import { NewQuote } from '../../../../../../features/crm/quote-pages';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Nueva cotización' };

interface NewQuotePageProps {
  searchParams: Promise<{ oportunidad?: string }>;
}

export default async function NewQuotePage({
  searchParams,
}: NewQuotePageProps): Promise<JSX.Element> {
  const { oportunidad } = await searchParams;
  return (
    <RequirePermission anyOf={['crm.quote.create']}>
      {oportunidad === undefined ? (
        <p>Cree la cotización desde la ficha de una oportunidad abierta del embudo.</p>
      ) : (
        <NewQuote opportunityId={oportunidad} />
      )}
    </RequirePermission>
  );
}
