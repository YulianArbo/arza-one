import type { Metadata } from 'next';
import type { JSX } from 'react';

import { RequirePermission } from '../../../../../../features/session/permissions';
import { NewDefinition } from '../../../../../../features/workflows/definition-editor';

export const metadata: Metadata = { title: 'Nuevo flujo' };

export default function NewWorkflowPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['wf.definition.manage']}>
      <NewDefinition />
    </RequirePermission>
  );
}
