'use client';

import {
  LEAVE_STATUS,
  OVERTIME_KINDS,
  OVERTIME_STATUS,
  PERFORMANCE_REVIEW_STATUS,
  decideLeaveSchema,
  leaveRequestListResponseSchema,
  overtimeListResponseSchema,
  performanceReviewListResponseSchema,
  rejectLeaveSchema,
  teamResponseSchema,
  type LeaveRequest,
  type Overtime,
} from '@arza/contracts';
import { PageHeader } from '@arza/ui';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { HrDialogForm, HrList, HrSection, orNull } from './hr-dialog';
import { useHrQuery } from './hr-queries';
import { NewReview, ScoreReview } from './review-forms';

// «Mi equipo» (B36, decisión 2): el jefe inmediato aprueba o rechaza las ausencias y autoriza las
// horas extras de su equipo directo, y fija y califica sus evaluaciones de desempeño.

/** Aprobar (con nota opcional) o rechazar (con motivo) una solicitud. */
function Decision(props: {
  readonly allowed: boolean;
  readonly what: string;
  readonly path: string;
  readonly version: number;
  readonly approveLabel: string;
}): JSX.Element | null {
  const api = useApiClient();
  if (!props.allowed) return null;
  const post = (action: string, body: object, csrfToken: string) =>
    api.post(`${props.path}/actions/${action}`, { body, csrfToken, version: props.version });
  return (
    <div className="flex flex-wrap gap-2">
      <HrDialogForm
        allowed
        label={props.approveLabel}
        title={`${props.approveLabel}: ${props.what}`}
        description="Puede dejar una nota para el colaborador."
        fields={[{ key: 'note', label: 'Nota (opcional)' }]}
        schema={decideLeaveSchema}
        prepare={(values) => ({ note: orNull(values['note']) })}
        run={(body, csrfToken) =>
          post(props.path.includes('overtime') ? 'authorize' : 'approve', body, csrfToken)
        }
        submitLabel={props.approveLabel}
      />
      <HrDialogForm
        allowed
        label="Rechazar"
        title={`Rechazar: ${props.what}`}
        description="El colaborador verá el motivo."
        fields={[{ key: 'note', label: 'Motivo' }]}
        schema={rejectLeaveSchema}
        run={(body, csrfToken) => post('reject', body, csrfToken)}
        submitLabel="Rechazar"
      />
    </div>
  );
}

function LeaveRow({ leave }: { readonly leave: LeaveRequest }): JSX.Element {
  return (
    <>
      <span>
        <strong>{leave.employee.name}</strong> · {leave.type_label} · {formatDate(leave.starts_on)}{' '}
        a {formatDate(leave.ends_on)} ({String(leave.days)} días)
      </span>
      <span>{LEAVE_STATUS[leave.status]}</span>
      <Decision
        allowed={leave.can_decide}
        what={`${leave.type_label} de ${leave.employee.name}`}
        path={`/v1/hr/leave-requests/${leave.id}`}
        version={leave.version}
        approveLabel="Aprobar"
      />
    </>
  );
}

function OvertimeRow({ item }: { readonly item: Overtime }): JSX.Element {
  return (
    <>
      <span>
        <strong>{item.employee.name}</strong> · {formatDate(item.work_date)} ·{' '}
        {OVERTIME_KINDS[item.kind]} · {String(item.hours)} h · {item.reason}
      </span>
      <span>{OVERTIME_STATUS[item.status]}</span>
      <Decision
        allowed={item.can_decide}
        what={`horas extras de ${item.employee.name}`}
        path={`/v1/hr/overtime/${item.id}`}
        version={item.version}
        approveLabel="Autorizar"
      />
    </>
  );
}

function TeamMembers(): JSX.Element {
  const query = useHrQuery('/v1/hr/me/team', teamResponseSchema);
  return (
    <HrSection id="equipo" title="Mi equipo directo">
      <QueryState query={query} loadingLabel="Cargando su equipo">
        {({ data }) => (
          <>
            <NewReview
              employees={data.map(({ employee_id, name }) => ({ id: employee_id, name }))}
            />
            <HrList
              items={data}
              empty="No tiene personas a cargo en el organigrama."
              keyOf={(member) => member.employee_id}
              render={(member) => (
                <>
                  <strong>{member.name}</strong>
                  <span>
                    {member.position.name} · {member.vacation_available.replace('.', ',')} días de
                    vacaciones disponibles
                  </span>
                </>
              )}
            />
          </>
        )}
      </QueryState>
    </HrSection>
  );
}

function TeamLeaves(): JSX.Element {
  const leaves = useHrQuery('/v1/hr/me/team/leave-requests', leaveRequestListResponseSchema);
  return (
    <HrSection id="ausencias-equipo" title="Ausencias por decidir">
      <QueryState query={leaves} loadingLabel="Cargando ausencias">
        {({ data }) => (
          <HrList
            items={data}
            empty="No hay solicitudes de su equipo."
            keyOf={(leave) => leave.id}
            render={(leave) => <LeaveRow leave={leave} />}
          />
        )}
      </QueryState>
    </HrSection>
  );
}

function TeamOvertime(): JSX.Element {
  const overtime = useHrQuery('/v1/hr/me/team/overtime', overtimeListResponseSchema);
  return (
    <HrSection id="horas-equipo" title="Horas extras por autorizar">
      <QueryState query={overtime} loadingLabel="Cargando horas extras">
        {({ data }) => (
          <HrList
            items={data}
            empty="No hay horas extras de su equipo."
            keyOf={(item) => item.id}
            render={(item) => <OvertimeRow item={item} />}
          />
        )}
      </QueryState>
    </HrSection>
  );
}

function TeamReviews(): JSX.Element {
  const reviews = useHrQuery(
    '/v1/hr/me/team/performance-reviews',
    performanceReviewListResponseSchema,
  );
  return (
    <HrSection id="evaluaciones-equipo" title="Evaluaciones de desempeño">
      <QueryState query={reviews} loadingLabel="Cargando evaluaciones">
        {({ data }) => (
          <HrList
            items={data}
            empty="No hay evaluaciones de su equipo."
            keyOf={(review) => review.id}
            render={(review) => (
              <>
                <span>
                  <strong>{review.employee.name}</strong> · periodo {review.period} ·{' '}
                  {PERFORMANCE_REVIEW_STATUS[review.status]}
                </span>
                <ScoreReview review={review} />
              </>
            )}
          />
        )}
      </QueryState>
    </HrSection>
  );
}

export function MyTeam(): JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Mi equipo"
        description="Lo que le corresponde decidir como jefe inmediato."
      />
      <TeamLeaves />
      <TeamOvertime />
      <TeamReviews />
      <TeamMembers />
    </div>
  );
}
