import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { HolidaysPanel } from '../../../../../features/organization/holidays-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Festivos y días hábiles' };

export default function HolidaysPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['core.parameter.read']}>
      <PageHeader
        title="Festivos y días hábiles"
        description="Los festivos de Colombia que cuentan para los plazos en días hábiles."
      />
      <HolidaysPanel />
    </RequirePermission>
  );
}
