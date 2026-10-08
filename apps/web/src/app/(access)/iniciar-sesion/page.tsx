import { LoadingState } from '@arza/ui';
import type { Metadata } from 'next';
import { Suspense, type JSX } from 'react';

import { LoginForm } from '../../../features/access/login-form';

export const metadata: Metadata = { title: 'Iniciar sesión' };

export default function LoginPage(): JSX.Element {
  return (
    <Suspense fallback={<LoadingState label="Cargando" />}>
      <LoginForm />
    </Suspense>
  );
}
