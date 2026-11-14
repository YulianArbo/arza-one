import type { Metadata } from 'next';
import type { JSX } from 'react';

import { KnowledgeCreate } from '../../../../../../features/service/knowledge-form';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Escribir un artículo' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['service.kb.manage']}>
      <KnowledgeCreate />
    </RequirePermission>
  );
}
