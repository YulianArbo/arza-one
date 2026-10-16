import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { RequirePermission } from '../../../../../features/session/permissions';
import { TaskBoard } from '../../../../../features/workflows/task-board';

export const metadata: Metadata = { title: 'Tablero de tareas' };

export default function TaskBoardPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['wf.task.read_all']}>
      <PageHeader
        title="Tablero de tareas"
        description="Todas las tareas de la empresa. Una tarea vencida escala al jefe inmediato y queda visible aquí."
      />
      <TaskBoard />
    </RequirePermission>
  );
}
