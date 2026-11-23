import { LoadingState } from '@arza/ui';
import type { Metadata } from 'next';
import { Suspense, type JSX } from 'react';

import { AcceptTerms } from '../../../features/platform-terms/accept-terms';

export const metadata: Metadata = { title: 'Términos de uso' };

export default function AcceptTermsPage(): JSX.Element {
  return (
    <Suspense fallback={<LoadingState label="Cargando" />}>
      <AcceptTerms />
    </Suspense>
  );
}
