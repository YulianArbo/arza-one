import { LoadingState } from '@arza/ui';
import type { Metadata } from 'next';
import { Suspense, type JSX } from 'react';

import { SecondFactorSetup } from '../../../../features/second-factor/second-factor-setup';

export const metadata: Metadata = { title: 'Configurar el segundo factor' };

export default function SecondFactorSetupPage(): JSX.Element {
  return (
    <Suspense fallback={<LoadingState label="Cargando" />}>
      <SecondFactorSetup />
    </Suspense>
  );
}
