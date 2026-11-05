import type { Metadata } from 'next';
import type { JSX } from 'react';

import { ClientSignature } from '../../../features/client-signature/client-signature';

export const metadata: Metadata = { title: 'Firma del documento' };

export default function ClientSignaturePage(): JSX.Element {
  return <ClientSignature />;
}
