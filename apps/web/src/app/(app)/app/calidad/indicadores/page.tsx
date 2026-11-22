import type { Metadata } from 'next';
import type { JSX } from 'react';

import { QualityIndicators } from '../../../../../features/quality/quality-indicators';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Indicadores' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['qms.read']}>
      <QualityIndicators />
    </RequirePermission>
  );
}
