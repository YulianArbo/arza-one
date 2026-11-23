import type { Metadata } from 'next';
import type { JSX } from 'react';

import { InnovationIdeas } from '../../../../../features/innovation/innovation-ideas';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Banco de ideas' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['inn.read']}>
      <InnovationIdeas />
    </RequirePermission>
  );
}
