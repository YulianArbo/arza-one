import type { Metadata } from 'next';
import type { JSX } from 'react';

import { InnovationHome } from '../../../../features/innovation/innovation-home';
import { RequirePermission } from '../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Innovación y propiedad intelectual' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['inn.read', 'inn.idea.create']}>
      <InnovationHome />
    </RequirePermission>
  );
}
