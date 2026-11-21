import type { Metadata } from 'next';
import type { JSX } from 'react';

import { QualityHome } from '../../../../features/quality/quality-home';
import { RequirePermission } from '../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Calidad y mejora continua' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['qms.read', 'qms.nonconformity.create']}>
      <QualityHome />
    </RequirePermission>
  );
}
