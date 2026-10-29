import type { Metadata } from 'next';
import type { JSX } from 'react';

import { EditQuote } from '../../../../../../../features/crm/quote-pages';
import { RequirePermission } from '../../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Editar cotización' };

interface EditQuotePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditQuotePage({ params }: EditQuotePageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['crm.quote.update']}>
      <EditQuote id={id} />
    </RequirePermission>
  );
}
