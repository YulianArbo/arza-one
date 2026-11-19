'use client';

import {
  LEAVE_STATUS,
  OVERTIME_KINDS,
  OVERTIME_STATUS,
  employeeListResponseSchema,
  hrCreatedResponseSchema,
  leaveRequestListResponseSchema,
  leaveTypeListResponseSchema,
  overtimeListResponseSchema,
  registerLeaveSchema,
} from '@arza/contracts';
import { PageHeader } from '@arza/ui';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { bogotaToday } from '../crm/labels';
import { usePermissions } from '../session/permissions';
import { HrDialogForm, HrList, HrSection, orNull } from './hr-dialog';
import { useHrQuery } from './hr-queries';

// Permisos, vacaciones y horas extras de toda la empresa (B36), para Talento humano y la Dirección.
// Talento humano registra a nombre de un colaborador las incapacidades, las licencias con soporte y
// las vacaciones anticipadas; quedan aprobadas al registrarse (decisiones 3 y 4).

/** Colaboradores activos para las listas de selección. */
export function useActiveEmployees(
  enabled = true,
): { readonly value: string; readonly label: string }[] {
  const query = useHrQuery('/v1/hr/employees', employeeListResponseSchema, enabled);
  return (query.data?.data ?? [])
    .filter((employee) => employee.status === 'active')
    .map(({ id, name }) => ({ value: id, label: name }));
}

function RegisterLeave(): JSX.Element {
  const api = useApiClient();
  const [key] = useState(() => crypto.randomUUID());
  const employees = useActiveEmployees();
  const types = useHrQuery('/v1/hr/leave-types', leaveTypeListResponseSchema);
  return (
    <HrDialogForm
      allowed
      label="Registrar ausencia"
      title="Registrar una ausencia a nombre de un colaborador"
      description="Incapacidades (sin diagnóstico), licencias con soporte o vacaciones anticipadas. Queda aprobada y llega a nómina."
      fields={[
        { key: 'employee_id', label: 'Colaborador', options: employees },
        {
          key: 'type',
          label: 'Tipo',
          options: (types.data?.data ?? []).map(({ code, label }) => ({ value: code, label })),
        },
        { key: 'starts_on', label: 'Desde', type: 'date', value: bogotaToday() },
        { key: 'ends_on', label: 'Hasta', type: 'date', value: bogotaToday() },
        { key: 'note', label: 'Observación (opcional)' },
      ]}
      schema={registerLeaveSchema}
      prepare={(values) => ({ ...values, note: orNull(values['note']) })}
      run={(body, csrfToken) =>
        api.post('/v1/hr/leave-requests', {
          body,
          csrfToken,
          schema: hrCreatedResponseSchema,
          idempotencyKey: key,
        })
      }
      submitLabel="Registrar"
    />
  );
}

function Leaves(): JSX.Element {
  const query = useHrQuery('/v1/hr/leave-requests', leaveRequestListResponseSchema);
  const { can } = usePermissions();
  return (
    <HrSection id="ausencias" title="Ausencias de la empresa">
      {can('hr.employee.manage') ? <RegisterLeave /> : null}
      <QueryState query={query} loadingLabel="Cargando ausencias">
        {({ data }) => (
          <HrList
            items={data}
            empty="No hay ausencias registradas."
            keyOf={(leave) => leave.id}
            render={(leave) => (
              <>
                <span>
                  <strong>{leave.employee.name}</strong> · {leave.type_label} ·{' '}
                  {formatDate(leave.starts_on)} a {formatDate(leave.ends_on)} ({String(leave.days)}{' '}
                  días)
                </span>
                <span>
                  {LEAVE_STATUS[leave.status]}
                  {leave.approver === null ? null : ` · Decide ${leave.approver.name}`}
                </span>
              </>
            )}
          />
        )}
      </QueryState>
    </HrSection>
  );
}

function OvertimeAll(): JSX.Element {
  const query = useHrQuery('/v1/hr/overtime', overtimeListResponseSchema);
  return (
    <HrSection id="horas-extras" title="Horas extras de la empresa">
      <QueryState query={query} loadingLabel="Cargando horas extras">
        {({ data }) => (
          <HrList
            items={data}
            empty="No hay horas extras registradas."
            keyOf={(item) => item.id}
            render={(item) => (
              <>
                <span>
                  <strong>{item.employee.name}</strong> · {formatDate(item.work_date)} ·{' '}
                  {OVERTIME_KINDS[item.kind]} · {String(item.reported_hours ?? item.hours)} h
                </span>
                <span>{OVERTIME_STATUS[item.status]}</span>
              </>
            )}
          />
        )}
      </QueryState>
    </HrSection>
  );
}

export function AbsencesAdmin(): JSX.Element {
  const { can } = usePermissions();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Permisos, vacaciones y horas extras"
        description="Las decide el jefe inmediato de cada persona desde «Mi equipo»."
      />
      {can('hr.leave.approve') ? <Leaves /> : null}
      {can('hr.overtime.authorize') ? <OvertimeAll /> : null}
    </div>
  );
}
