import type { Metadata } from 'next';
import type { JSX } from 'react';

import { RequirePermission } from '../../../../../../features/session/permissions';
import { SstPlan } from '../../../../../../features/sst/sst-plan';

export const metadata: Metadata = { title: 'Plan anual de SST' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['sst.read']}>
      <SstPlan />
    </RequirePermission>
  );
}
