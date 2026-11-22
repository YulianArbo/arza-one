import type { Metadata } from 'next';
import type { JSX } from 'react';

import { QualityActions } from '../../../../../features/quality/quality-actions';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Bitácora de acciones' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['qms.read']}>
      <QualityActions />
    </RequirePermission>
  );
}
