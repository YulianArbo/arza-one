'use client';

import { EmptyState, LoadingState } from '@arza/ui';
import { Bell, LayoutDashboard } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { useNotifications } from '../notifications/queries';
import { usePermissions } from '../session/permissions';
import { CrmOverview } from './crm-overview';
import { Panel } from './panel';
import { TaskOverview } from './task-overview';

// Tablero de Inicio según el rol (16.3, B22A): cada bloque aparece si la persona puede verlo.

function RecentNotices(): JSX.Element {
  return (
    <Panel title="Avisos recientes">
      <QueryState query={useNotifications(false, 5)} loadingLabel="Cargando sus avisos">
        {({ items }) =>
          items.length === 0 ? (
            <EmptyState
              title="Sin avisos"
              description="Aquí verá los avisos de sus procesos."
              icon={<Bell />}
            />
          ) : (
            <ul className="flex flex-col divide-y">
              {items.map((notice) => (
                <li key={notice.id} className="flex flex-col py-3 first:pt-0">
                  {notice.link ? (
                    <Link className="font-medium text-primary underline" href={notice.link}>
                      {notice.title}
                    </Link>
                  ) : (
                    <span className="font-medium">{notice.title}</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(notice.delivered_at)}
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </Panel>
  );
}

export function HomeDashboard(): JSX.Element {
  const permissions = usePermissions();
  if (!permissions.ready) return <LoadingState label="Preparando su tablero" />;
  const tasks = permissions.can('wf.task.work');
  const crm = permissions.can('crm.report.read');
  return (
    <div className="flex flex-col gap-6">
      {tasks ? <TaskOverview /> : null}
      {crm ? <CrmOverview /> : null}
      {tasks || crm ? null : (
        <EmptyState
          title="Su tablero"
          description="Su rol todavía no tiene indicadores. Use el menú para ir a sus módulos."
          icon={<LayoutDashboard />}
        />
      )}
      <RecentNotices />
    </div>
  );
}
