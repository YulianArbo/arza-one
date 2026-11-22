import type { Metadata } from 'next';
import type { JSX } from 'react';

import { QualityNonconformities } from '../../../../../features/quality/quality-nonconformities';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'No conformidades' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['qms.read']}>
      <QualityNonconformities />
    </RequirePermission>
  );
}
