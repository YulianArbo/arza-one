import type { Metadata } from 'next';
import type { JSX } from 'react';

import { QualityProcesses } from '../../../../../features/quality/quality-processes';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Mapa de procesos' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['qms.read']}>
      <QualityProcesses />
    </RequirePermission>
  );
}
