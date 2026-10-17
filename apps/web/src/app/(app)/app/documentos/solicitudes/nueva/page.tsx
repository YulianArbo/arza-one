import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../../components/app-shell/page-header';
import { ChangeRequestForm } from '../../../../../../features/documents/change-request-form';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Nueva solicitud de acción documental' };

interface NewRequestPageProps {
  searchParams: Promise<{ documento?: string | string[]; accion?: string | string[] }>;
}

export default async function NewRequestPage({
  searchParams,
}: NewRequestPageProps): Promise<JSX.Element> {
  const { documento, accion } = await searchParams;
  return (
    <RequirePermission anyOf={['doc.change_request.create']}>
      <PageHeader
        title="Nueva solicitud de acción documental"
        description="FT-SGC-001. Recibe su código al radicarla y Calidad la analiza."
      />
      <ChangeRequestForm
        documentId={typeof documento === 'string' ? documento : null}
        action={typeof accion === 'string' ? accion : null}
      />
    </RequirePermission>
  );
}
