import type { Metadata } from 'next';
import type { JSX } from 'react';

import { ResetPassword } from '../../../features/access/link-forms';

export const metadata: Metadata = { title: 'Crear contraseña nueva' };

export default function ResetPasswordPage(): JSX.Element {
  return <ResetPassword />;
}
