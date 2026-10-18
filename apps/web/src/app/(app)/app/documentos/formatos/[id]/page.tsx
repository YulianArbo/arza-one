import type { Metadata } from 'next';
import type { JSX } from 'react';

import { TemplateDetail } from '../../../../../../features/forms/template-detail';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Formato digital' };

interface FormPageProps {
  params: Promise<{ id: string }>;
}

export default async function FormPage({ params }: FormPageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['doc.document.read']}>
      <TemplateDetail id={id} />
    </RequirePermission>
  );
}
