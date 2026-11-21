'use client';

import { ACTION_STATUSES, qmsActionListResponseSchema, type QmsAction } from '@arza/contracts';
import { Badge } from '@arza/ui';
import type { JSX } from 'react';

import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { HrList, HrSection } from '../hr/hr-dialog';
import { usePermissions } from '../session/permissions';
import { ExecuteAction } from './quality-actions';
import { useQmsQuery } from './quality-queries';

// Mis acciones de calidad en Mi espacio (B38, decisión 3): las acciones a cargo de la persona, para
// marcarlas ejecutadas con su evidencia. Las vencidas escalan a la Dirección.

function MyActionRow({ action }: { readonly action: QmsAction }): JSX.Element {
  return (
    <>
      <span className="flex flex-col gap-1">
        <span>
          <strong>{action.code}</strong>
          {action.origin === null ? '' : ` · ${action.origin.code}`} · compromiso{' '}
          {formatDate(action.due_on)}
        </span>
        <span>{action.description}</span>
        <Badge tone={action.overdue ? 'destructive' : 'info'}>
          {action.overdue ? 'Vencida' : ACTION_STATUSES[action.status]}
        </Badge>
      </span>
      <ExecuteAction action={action} />
    </>
  );
}

export function MyQualityActions(): JSX.Element | null {
  const { can } = usePermissions();
  const allowed = can('qms.action.manage');
  const query = useQmsQuery('/v1/qms/my/actions', qmsActionListResponseSchema, allowed);
  if (!allowed) return null;
  return (
    <HrSection id="mis-acciones-calidad" title="Mis acciones de calidad">
      <QueryState query={query} loadingLabel="Cargando sus acciones">
        {({ data }) => (
          <HrList
            items={data}
            empty="No tiene acciones de calidad a su cargo."
            keyOf={(item) => item.id}
            render={(item) => <MyActionRow action={item} />}
          />
        )}
      </QueryState>
    </HrSection>
  );
}
