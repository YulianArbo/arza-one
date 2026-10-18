import type { Metadata } from 'next';
import type { JSX } from 'react';

import { TemplateList } from '../../../../../features/forms/template-list';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Formatos digitales' };

export default function FormsPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['doc.document.read']}>
      <TemplateList />
    </RequirePermission>
  );
}
