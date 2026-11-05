import type { Metadata } from 'next';
import type { JSX } from 'react';

import { ProjectList } from '../../../../features/projects/project-list';
import { RequirePermission } from '../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Proyectos' };

export default function ProjectsPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['project.read_all', 'project.read_member']}>
      <ProjectList />
    </RequirePermission>
  );
}
