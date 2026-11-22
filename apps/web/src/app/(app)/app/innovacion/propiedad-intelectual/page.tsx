import type { Metadata } from 'next';
import type { JSX } from 'react';

import { InnovationPortfolio } from '../../../../../features/innovation/innovation-portfolio';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Propiedad intelectual' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['inn.read']}>
      <InnovationPortfolio />
    </RequirePermission>
  );
}
