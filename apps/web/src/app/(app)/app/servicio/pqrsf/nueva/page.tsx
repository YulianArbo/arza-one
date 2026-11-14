import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PqrsfForm } from '../../../../../../features/service/pqrsf-form';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Registrar una PQRSF' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['service.pqrsf.classify']}>
      <PqrsfForm />
    </RequirePermission>
  );
}
