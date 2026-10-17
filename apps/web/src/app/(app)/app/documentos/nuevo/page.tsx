import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { DocumentForm } from '../../../../../features/documents/document-form';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Nuevo documento' };

interface NewDocumentPageProps {
  searchParams: Promise<{ carpeta?: string | string[] }>;
}

export default async function NewDocumentPage({
  searchParams,
}: NewDocumentPageProps): Promise<JSX.Element> {
  const { carpeta } = await searchParams;
  const folderId = typeof carpeta === 'string' ? carpeta : null;
  return (
    <RequirePermission anyOf={['doc.document.create']}>
      <PageHeader
        title="Nuevo documento"
        description="Nace con su versión 00 en borrador. El código lo asigna el sistema al guardar, sin saltos."
      />
      <DocumentForm folderId={folderId} />
    </RequirePermission>
  );
}
