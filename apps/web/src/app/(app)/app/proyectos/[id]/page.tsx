import type { Metadata } from 'next';
import type { JSX } from 'react';

import { ProjectDetailPanel } from '../../../../../features/projects/project-detail';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Ficha del proyecto' };

interface ProjectPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['project.read_all', 'project.read_member']}>
      <ProjectDetailPanel id={id} />
    </RequirePermission>
  );
}
