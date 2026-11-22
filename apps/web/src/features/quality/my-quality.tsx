'use client';

import {
  ACTION_STATUSES,
  auditListResponseSchema,
  indicatorListResponseSchema,
  qmsActionListResponseSchema,
  type Indicator,
  type QmsAction,
} from '@arza/contracts';
import { Badge } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { HrList, HrSection } from '../hr/hr-dialog';
import { usePermissions } from '../session/permissions';
import { ExecuteAction } from './quality-actions';
import { AuditRow } from './quality-audits';
import { useQmsQuery } from './quality-queries';

// Mis acciones de calidad en Mi espacio (B38, decisión 3): las acciones a cargo de la persona, para
// marcarlas ejecutadas con su evidencia. Las vencidas escalan a la Dirección. Desde B39, también las
// auditorías que le asignaron y los indicadores a su cargo.

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

/** Las auditorías asignadas a la persona (B39, decisión 1). */
export function MyAudits(): JSX.Element | null {
  const { can } = usePermissions();
  const allowed = can('qms.audit.execute');
  const query = useQmsQuery('/v1/qms/my/audits', auditListResponseSchema, allowed);
  if (!allowed) return null;
  return (
    <HrSection id="mis-auditorias" title="Mis auditorías">
      <QueryState query={query} loadingLabel="Cargando sus auditorías">
        {({ data }) => (
          <HrList
            items={data}
            empty="No tiene auditorías asignadas."
            keyOf={(item) => item.id}
            render={(item) => <AuditRow audit={item} />}
          />
        )}
      </QueryState>
    </HrSection>
  );
}

function MyIndicatorRow({ item }: { readonly item: Indicator }): JSX.Element {
  return (
    <>
      <span className="flex flex-col gap-1">
        <span>
          <strong>{item.code}</strong> · {item.name}
        </span>
        {item.pending_period === null ? (
          <Badge tone="success">Al día</Badge>
        ) : (
          <Badge tone="warning">
            Falta la medición del periodo que empezó el {formatDate(item.pending_period)}
          </Badge>
        )}
      </span>
      <Link className="text-sm underline" href={'/app/calidad/indicadores/' + item.id}>
        Medir {item.code}
      </Link>
    </>
  );
}

/** Los indicadores a cargo de la persona (B39, decisión 7). */
export function MyIndicators(): JSX.Element | null {
  const { can } = usePermissions();
  const allowed = can('qms.indicator.measure');
  const query = useQmsQuery('/v1/qms/my/indicators', indicatorListResponseSchema, allowed);
  if (!allowed) return null;
  return (
    <HrSection id="mis-indicadores" title="Mis indicadores">
      <QueryState query={query} loadingLabel="Cargando sus indicadores">
        {({ data }) => (
          <HrList
            items={data}
            empty="No tiene indicadores a su cargo."
            keyOf={(item) => item.id}
            render={(item) => <MyIndicatorRow item={item} />}
          />
        )}
      </QueryState>
    </HrSection>
  );
}
