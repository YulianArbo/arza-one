import type { Metadata } from 'next';
import type { JSX } from 'react';

import { KnowledgeArticle } from '../../../../../../features/service/knowledge-article';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Artículo' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['service.kb.read']}>
      <KnowledgeArticle id={id} />
    </RequirePermission>
  );
}
