import type { Metadata } from 'next';
import type { JSX } from 'react';

import { RequirePermission } from '../../../../../../features/session/permissions';
import { DefinitionEditor } from '../../../../../../features/workflows/definition-editor';

export const metadata: Metadata = { title: 'Flujo' };

interface WorkflowPageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkflowPage({ params }: WorkflowPageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['wf.definition.manage']}>
      <DefinitionEditor id={id} />
    </RequirePermission>
  );
}
