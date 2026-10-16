import type { Metadata } from 'next';
import type { JSX } from 'react';

import { RequirePermission } from '../../../../../features/session/permissions';
import { TaskDetail } from '../../../../../features/workflows/task-detail';

export const metadata: Metadata = { title: 'Tarea' };

interface TaskPageProps {
  params: Promise<{ id: string }>;
}

export default async function TaskPage({ params }: TaskPageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['wf.task.work']}>
      <TaskDetail id={id} />
    </RequirePermission>
  );
}
