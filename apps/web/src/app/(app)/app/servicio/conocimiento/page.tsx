import type { Metadata } from 'next';
import type { JSX } from 'react';

import { KnowledgeList } from '../../../../../features/service/knowledge-list';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Base de conocimiento' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['service.kb.read']}>
      <KnowledgeList />
    </RequirePermission>
  );
}
