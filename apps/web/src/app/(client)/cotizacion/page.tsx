import type { Metadata } from 'next';
import type { JSX } from 'react';

import { ClientQuote } from '../../../features/client-quote/client-quote';

export const metadata: Metadata = { title: 'Cotización' };

export default function ClientQuotePage(): JSX.Element {
  return <ClientQuote />;
}
