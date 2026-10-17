import type { Metadata } from 'next';
import type { JSX } from 'react';

import { DocumentDetail } from '../../../../../features/documents/document-detail';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Ficha del documento' };

interface DocumentPageProps {
  params: Promise<{ id: string }>;
}

export default async function DocumentPage({ params }: DocumentPageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['doc.document.read']}>
      <DocumentDetail id={id} />
    </RequirePermission>
  );
}
