import type { Metadata } from 'next';
import type { JSX } from 'react';

import { OutputTemplatesPanel } from '../../../../../features/forms/output-templates';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Plantillas de salida' };

export default function OutputTemplatesPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['doc.form_template.manage']}>
      <OutputTemplatesPanel />
    </RequirePermission>
  );
}
