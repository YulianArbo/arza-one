import type { Metadata } from 'next';
import type { JSX } from 'react';

import { AssetsPanel } from '../../../../../features/assets/assets-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Activos' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['asset.read']}>
      <AssetsPanel />
    </RequirePermission>
  );
}
