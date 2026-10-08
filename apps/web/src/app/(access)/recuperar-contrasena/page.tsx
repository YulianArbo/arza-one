import type { Metadata } from 'next';
import type { JSX } from 'react';

import { ForgotPasswordForm } from '../../../features/access/forgot-password-form';

export const metadata: Metadata = { title: 'Recuperar contraseña' };

export default function ForgotPasswordPage(): JSX.Element {
  return <ForgotPasswordForm />;
}
