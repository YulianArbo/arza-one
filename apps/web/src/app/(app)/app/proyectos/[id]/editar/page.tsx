import type { Metadata } from 'next';
import type { JSX } from 'react';

import { EditProject } from '../../../../../../features/projects/project-edit';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Editar el proyecto' };

interface EditProjectPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProjectPage({
  params,
}: EditProjectPageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['project.update']}>
      <EditProject id={id} />
    </RequirePermission>
  );
}
