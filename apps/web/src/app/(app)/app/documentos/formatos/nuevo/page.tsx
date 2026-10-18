import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../../components/app-shell/page-header';
import { FormDesigner } from '../../../../../../features/forms/form-designer';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Nuevo formato digital' };

export default function NewFormPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['doc.form_template.manage']}>
      <PageHeader
        title="Nuevo formato digital"
        description="Arme las secciones y los campos del formato. Se guarda en borrador; al publicarlo queda la versión 1."
      />
      <FormDesigner mode={{ kind: 'new' }} />
    </RequirePermission>
  );
}
