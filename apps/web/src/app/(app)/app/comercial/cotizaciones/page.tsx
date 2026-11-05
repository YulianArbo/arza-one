import type { Metadata } from 'next';
import type { JSX } from 'react';

import { CrmScreen } from '../../../../../features/crm/crm-screen';
import { QuoteList } from '../../../../../features/crm/quote-list';

export const metadata: Metadata = { title: 'Cotizaciones' };

export default function QuotesPage(): JSX.Element {
  return (
    <CrmScreen
      anyOf={['crm.quote.read']}
      title="Cotizaciones"
      description="Propuestas a los clientes, con su aprobación, su envío y la respuesta en línea."
    >
      <QuoteList />
    </CrmScreen>
  );
}
