import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../../../components/app-shell/page-header';
import { TemplateDesigner } from '../../../../../../../features/forms/form-designer';
import { RequirePermission } from '../../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Editar el borrador del formato' };

interface DesignPageProps {
  params: Promise<{ id: string }>;
}

export default async function DesignPage({ params }: DesignPageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['doc.form_template.manage']}>
      <PageHeader
        title="Editar el borrador del formato"
        description="Los cambios se guardan en el borrador; publíquelo para usarlo."
      />
      <TemplateDesigner id={id} kind="edit" />
    </RequirePermission>
  );
}
