import type { Metadata } from 'next';
import type { JSX } from 'react';

import { KnowledgeEdit } from '../../../../../../../features/service/knowledge-form';
import { RequirePermission } from '../../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Editar el artículo' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['service.kb.manage']}>
      <KnowledgeEdit id={id} />
    </RequirePermission>
  );
}
