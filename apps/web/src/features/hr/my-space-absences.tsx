'use client';

import {
  LEAVE_STATUS,
  OVERTIME_KINDS,
  OVERTIME_STATUS,
  hrCreatedResponseSchema,
  leaveRequestListResponseSchema,
  leaveTypeListResponseSchema,
  overtimeListResponseSchema,
  reportOvertimeSchema,
  requestLeaveSchema,
  requestOvertimeSchema,
  type LeaveRequest,
  type Overtime,
} from '@arza/contracts';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { bogotaToday } from '../crm/labels';
import { HrActionButton, HrDialogForm, HrList, HrSection, optionsOf, orNull } from './hr-dialog';
import { useHrQuery } from './hr-queries';

// «Mi espacio» (B36): las ausencias y horas extras propias. El colaborador solicita vacaciones o
// permisos, retira lo que aún está radicado, pide horas extras antes de trabajarlas y después
// reporta las horas trabajadas.

function LeaveRequestButton(): JSX.Element {
  const api = useApiClient();
  const [key] = useState(() => crypto.randomUUID());
  const types = useHrQuery('/v1/hr/leave-types', leaveTypeListResponseSchema);
  const options = (types.data?.data ?? [])
    .filter((type) => !type.hr_only)
    .map(({ code, label }) => ({ value: code, label }));
  return (
    <HrDialogForm
      allowed
      label="Solicitar ausencia"
      title="Solicitar vacaciones, permiso o licencia"
      description="Su jefe inmediato recibe la solicitud para decidirla. Las vacaciones se cuentan en días hábiles."
      fields={[
        { key: 'type', label: 'Tipo', options },
        { key: 'starts_on', label: 'Desde', type: 'date', value: bogotaToday() },
        { key: 'ends_on', label: 'Hasta', type: 'date', value: bogotaToday() },
        { key: 'note', label: 'Observación (opcional)' },
      ]}
      schema={requestLeaveSchema}
      prepare={(values) => ({ ...values, note: orNull(values['note']) })}
      run={(body, csrfToken) =>
        api.post('/v1/hr/me/leave-requests', {
          body,
          csrfToken,
          schema: hrCreatedResponseSchema,
          idempotencyKey: key,
        })
      }
      submitLabel="Enviar solicitud"
    />
  );
}

function LeaveRow({ leave }: { readonly leave: LeaveRequest }): JSX.Element {
  const api = useApiClient();
  return (
    <>
      <span>
        <strong>{leave.type_label}</strong> · {formatDate(leave.starts_on)} a{' '}
        {formatDate(leave.ends_on)} · {String(leave.days)} días
      </span>
      <span>
        {LEAVE_STATUS[leave.status]}
        {leave.decision_note === null ? null : ` · ${leave.decision_note}`}
      </span>
      {leave.status === 'requested' ? (
        <HrActionButton
          label="Retirar"
          pendingLabel="Retirando…"
          ariaLabel={`Retirar la solicitud de ${leave.type_label}`}
          run={(csrfToken) =>
            api.post(`/v1/hr/me/leave-requests/${leave.id}/actions/cancel`, {
              body: {},
              csrfToken,
              version: leave.version,
            })
          }
        />
      ) : null}
    </>
  );
}

export function MyLeaves(): JSX.Element {
  const query = useHrQuery('/v1/hr/me/leave-requests', leaveRequestListResponseSchema);
  return (
    <HrSection id="mis-ausencias" title="Mis vacaciones y permisos">
      <LeaveRequestButton />
      <QueryState query={query} loadingLabel="Cargando solicitudes">
        {({ data }) => (
          <HrList
            items={data}
            empty="Aún no tiene solicitudes."
            keyOf={(leave) => leave.id}
            render={(leave) => <LeaveRow leave={leave} />}
          />
        )}
      </QueryState>
    </HrSection>
  );
}

function OvertimeRequestButton(): JSX.Element {
  const api = useApiClient();
  const [key] = useState(() => crypto.randomUUID());
  return (
    <HrDialogForm
      allowed
      label="Pedir horas extras"
      title="Pedir autorización de horas extras"
      description="Se piden antes de trabajarlas. Tope: 2 horas por día y 12 por semana."
      fields={[
        { key: 'work_date', label: 'Día de trabajo', type: 'date', value: bogotaToday() },
        { key: 'kind', label: 'Clase', options: optionsOf(OVERTIME_KINDS) },
        { key: 'hours', label: 'Horas (en cuartos: 1, 1.5, 2)', type: 'number' },
        { key: 'reason', label: 'Motivo' },
      ]}
      schema={requestOvertimeSchema}
      prepare={(values) => ({ ...values, hours: Number(values['hours']) })}
      run={(body, csrfToken) =>
        api.post('/v1/hr/overtime', {
          body,
          csrfToken,
          schema: hrCreatedResponseSchema,
          idempotencyKey: key,
        })
      }
      submitLabel="Pedir autorización"
    />
  );
}

function ReportButton({ item }: { readonly item: Overtime }): JSX.Element | null {
  const api = useApiClient();
  return (
    <HrDialogForm
      allowed={item.status === 'authorized' && item.work_date <= bogotaToday()}
      label="Reportar horas"
      title="Reportar las horas trabajadas"
      description={`Autorizadas: ${String(item.hours)} horas. No puede reportar más.`}
      fields={[{ key: 'hours', label: 'Horas trabajadas', type: 'number' }]}
      schema={reportOvertimeSchema}
      prepare={(values) => ({ hours: Number(values['hours']) })}
      run={(body, csrfToken) =>
        api.post(`/v1/hr/overtime/${item.id}/actions/report`, {
          body,
          csrfToken,
          version: item.version,
        })
      }
      submitLabel="Reportar"
    />
  );
}

export function MyOvertime(): JSX.Element {
  const query = useHrQuery('/v1/hr/me/overtime', overtimeListResponseSchema);
  return (
    <HrSection id="mis-horas-extras" title="Mis horas extras">
      <OvertimeRequestButton />
      <QueryState query={query} loadingLabel="Cargando horas extras">
        {({ data }) => (
          <HrList
            items={data}
            empty="Aún no tiene horas extras."
            keyOf={(item) => item.id}
            render={(item) => (
              <>
                <span>
                  <strong>{formatDate(item.work_date)}</strong> · {OVERTIME_KINDS[item.kind]} ·{' '}
                  {String(item.reported_hours ?? item.hours)} h
                </span>
                <span>{OVERTIME_STATUS[item.status]}</span>
                <ReportButton item={item} />
              </>
            )}
          />
        )}
      </QueryState>
    </HrSection>
  );
}
