import type { Metadata } from 'next';
import type { JSX } from 'react';

import { ActivateAccount } from '../../../features/access/link-forms';

export const metadata: Metadata = { title: 'Activar cuenta' };

export default function ActivateAccountPage(): JSX.Element {
  return <ActivateAccount />;
}
