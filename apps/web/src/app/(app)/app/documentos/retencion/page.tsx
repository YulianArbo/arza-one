import type { Metadata } from 'next';
import type { JSX } from 'react';

import { RetentionRules } from '../../../../../features/documents/retention-rules';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Tabla de retención' };

export default function RetentionPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['doc.retention.manage']}>
      <RetentionRules />
    </RequirePermission>
  );
}
