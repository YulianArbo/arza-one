import { LoadingState } from '@arza/ui';
import type { Metadata } from 'next';
import { Suspense, type JSX } from 'react';

import { SecondFactorForm } from '../../../features/second-factor/second-factor-form';

export const metadata: Metadata = { title: 'Segundo factor' };

export default function SecondFactorPage(): JSX.Element {
  return (
    <Suspense fallback={<LoadingState label="Cargando" />}>
      <SecondFactorForm />
    </Suspense>
  );
}
