import type { Metadata } from 'next';
import type { JSX } from 'react';

import { RequirePermission } from '../../../../../features/session/permissions';
import { SstHome } from '../../../../../features/sst/sst-home';

export const metadata: Metadata = { title: 'Seguridad y salud en el trabajo' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['sst.read']}>
      <SstHome />
    </RequirePermission>
  );
}
