import type { Metadata } from 'next';
import type { JSX } from 'react';

import { VersionForm } from '../../../../../../features/documents/version-form';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Versión del documento' };

interface VersionPageProps {
  params: Promise<{ id: string }>;
}

export default async function VersionPage({ params }: VersionPageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['doc.document.update']}>
      <VersionForm id={id} />
    </RequirePermission>
  );
}
