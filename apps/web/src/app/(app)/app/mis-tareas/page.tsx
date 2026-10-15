import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../components/app-shell/page-header';
import { RequirePermission } from '../../../../features/session/permissions';
import { TaskInbox } from '../../../../features/workflows/task-inbox';

export const metadata: Metadata = { title: 'Mis tareas' };

export default function MyTasksPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['wf.task.work', 'wf.task.read_all']}>
      <PageHeader
        title="Mis tareas"
        description="Las tareas de todos los procesos en un solo lugar: primero las vencidas, luego las que vencen antes."
      />
      <TaskInbox />
    </RequirePermission>
  );
}
