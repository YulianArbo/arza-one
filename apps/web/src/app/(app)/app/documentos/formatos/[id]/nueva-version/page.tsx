import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../../../components/app-shell/page-header';
import { TemplateDesigner } from '../../../../../../../features/forms/form-designer';
import { RequirePermission } from '../../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Nueva versión del formato' };

interface DesignPageProps {
  params: Promise<{ id: string }>;
}

export default async function DesignPage({ params }: DesignPageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['doc.form_template.manage']}>
      <PageHeader
        title="Nueva versión del formato"
        description="Empieza con los campos de la versión actual. Los registros ya creados conservan su versión."
      />
      <TemplateDesigner id={id} kind="version" />
    </RequirePermission>
  );
}
