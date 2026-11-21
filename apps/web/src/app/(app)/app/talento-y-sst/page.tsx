import type { Metadata } from 'next';
import type { JSX } from 'react';

import { RequirePermission } from '../../../../features/session/permissions';
import { TalentLanding } from '../../../../features/sst/talent-landing';

export const metadata: Metadata = { title: 'Talento y SST' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission
      anyOf={['hr.employee.read', 'hr.vacancy.manage', 'hr.candidate.manage', 'sst.read']}
    >
      <TalentLanding />
    </RequirePermission>
  );
}
