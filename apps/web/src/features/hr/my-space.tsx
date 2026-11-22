'use client';

import {
  CONTRACT_TYPES,
  WORK_MODES,
  downloadLinkResponseSchema,
  mySpaceResponseSchema,
  type MyEmployment,
} from '@arza/contracts';
import { HighlightCard, PageHeader } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { HrActionButton } from './hr-dialog';
import { useHrQuery } from './hr-queries';
import { MyLeaves, MyOvertime } from './my-space-absences';
import { MyQualityActions } from '../quality/my-quality';
import { MySst } from '../sst/my-sst';
import { MyCitations, MyNovelties, MyReviews, MyTasks, MyTrainings } from './my-space-records';

// «Mi espacio» (B36, autoservicio del colaborador, ficha 17.13). Del salario solo se muestra la
// banda (decisión 11); el contrato firmado se descarga con un enlace temporal.

function ContractButton({ employeeId }: { readonly employeeId: string }): JSX.Element {
  const api = useApiClient();
  return (
    <HrActionButton
      label="Descargar mi contrato"
      pendingLabel="Preparando…"
      ariaLabel="Descargar mi contrato firmado"
      run={async (csrfToken) => {
        const link = await api.post(`/v1/hr/employees/${employeeId}/contract/download-link`, {
          body: {},
          csrfToken,
          schema: downloadLinkResponseSchema,
        });
        window.open(link.url, '_self');
      }}
    />
  );
}

function EmploymentCard({ employment }: { readonly employment: MyEmployment }): JSX.Element {
  return (
    <HighlightCard title="Mis datos laborales">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt>Cargo</dt>
        <dd>{employment.position.name}</dd>
        <dt>Ingreso</dt>
        <dd>{formatDate(employment.hire_date)}</dd>
        <dt>Contrato</dt>
        <dd>
          {CONTRACT_TYPES[employment.contract_type]} · {WORK_MODES[employment.work_mode]}
        </dd>
        <dt>Banda salarial</dt>
        <dd>{employment.salary_band_label ?? 'Sin contrato registrado'}</dd>
        <dt>Jefe inmediato</dt>
        <dd>{employment.manager?.name ?? 'Talento humano'}</dd>
      </dl>
      {employment.contract_available ? (
        <ContractButton employeeId={employment.employee_id} />
      ) : null}
    </HighlightCard>
  );
}

function VacationCard({ employment }: { readonly employment: MyEmployment }): JSX.Element {
  const vacation = employment.vacation;
  return (
    <HighlightCard title="Mis vacaciones" highlighted>
      <p className="text-display font-semibold">{vacation.available.replace('.', ',')} días</p>
      <p>
        Disponibles hoy. Ganados: {vacation.accrued.replace('.', ',')} · Usados o solicitados:{' '}
        {String(vacation.used)} · {String(vacation.days_per_year)} días hábiles por año.
      </p>
      {employment.has_team ? (
        <Link className="font-semibold underline" href="/app/mi-espacio/equipo">
          Ir a Mi equipo
        </Link>
      ) : null}
    </HighlightCard>
  );
}

function Summary({ employment }: { readonly employment: MyEmployment }): JSX.Element {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <EmploymentCard employment={employment} />
      <VacationCard employment={employment} />
    </div>
  );
}

export function MySpace(): JSX.Element {
  const query = useHrQuery('/v1/hr/me', mySpaceResponseSchema);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Mi espacio" description="Sus datos laborales, solicitudes y tareas." />
      <QueryState query={query} loadingLabel="Cargando su información">
        {({ employment }) =>
          employment === null ? (
            <p>Su cuenta aún no está vinculada como colaborador. Consulte con Talento humano.</p>
          ) : (
            <>
              <Summary employment={employment} />
              <MySst />
              <MyQualityActions />
              <MyCitations />
              <MyTasks />
              <MyLeaves />
              <MyOvertime />
              <MyReviews />
              <MyTrainings />
              <MyNovelties />
            </>
          )
        }
      </QueryState>
    </div>
  );
}
