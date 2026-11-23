import type { Metadata } from 'next';
import type { JSX } from 'react';

import { InnovationWatch } from '../../../../../features/innovation/innovation-watch';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Vigilancia y competencia' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['inn.read']}>
      <InnovationWatch />
    </RequirePermission>
  );
}
