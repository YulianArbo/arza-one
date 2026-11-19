'use client';

import {
  CANDIDATE_STAGES,
  EMPLOYEE_STATUS,
  VACANCY_STATUS,
  candidateListResponseSchema,
  employeeListResponseSchema,
  vacancyListResponseSchema,
} from '@arza/contracts';
import { QuickLinks, type QuickLink } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { usePermissions } from '../session/permissions';
import { useHrQuery } from './hr-queries';
import { CandidateActions, NewCandidate } from './candidate-forms';
import { CloseVacancy, NewVacancy } from './vacancy-forms';

/** Accesos a las demás funciones del módulo (B36), según los permisos de cada persona. */
const MODULE_LINKS: readonly (QuickLink & { readonly permissions: readonly string[] })[] = [
  { href: '/app/mi-espacio', label: 'Mi espacio', permissions: ['hr.employee.read'] },
  {
    href: '/app/talento-y-sst/ausencias',
    label: 'Permisos, vacaciones y horas extras',
    permissions: ['hr.leave.approve', 'hr.overtime.authorize'],
  },
  {
    href: '/app/talento-y-sst/nomina',
    label: 'Novedades de nómina',
    permissions: ['hr.payroll_novelty.close'],
  },
  {
    href: '/app/talento-y-sst/desempeno',
    label: 'Desempeño y formación',
    permissions: ['hr.performance.manage', 'hr.training.manage'],
  },
  {
    href: '/app/talento-y-sst/disciplinarios',
    label: 'Procesos disciplinarios',
    permissions: ['hr.disciplinary.manage'],
  },
  { href: '/app/talento-y-sst/retiros', label: 'Retiros', permissions: ['hr.offboarding.manage'] },
];

export function HrHome(): JSX.Element {
  const { can } = usePermissions();
  const links = MODULE_LINKS.filter((link) => link.permissions.some((code) => can(code)));
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Talento Humano" />
      <QuickLinks
        title="También en Talento humano"
        links={links.map(({ href, label }) => ({ href, label }))}
        linkAs={Link}
      />
      {can('hr.vacancy.manage') ? <Vacancies /> : null}
      {can('hr.candidate.manage') ? <Candidates /> : null}
      {can('hr.employee.read') ? <Employees /> : null}
    </div>
  );
}

function Vacancies(): JSX.Element {
  const query = useHrQuery('/v1/hr/vacancies', vacancyListResponseSchema);
  return (
    <section aria-labelledby="vacancies-title" className="space-y-3">
      <h2 id="vacancies-title" className="text-lg font-semibold">
        Vacantes
      </h2>
      <NewVacancy />
      <QueryState query={query} loadingLabel="Cargando vacantes">
        {({ data }) =>
          data.length === 0 ? (
            <p>No hay vacantes registradas.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {data.map((vacancy) => (
                <li key={vacancy.id} className="flex flex-wrap justify-between gap-2 p-3">
                  <span>
                    <strong>{vacancy.position.name}</strong> · {vacancy.code}
                  </span>
                  <span>
                    {VACANCY_STATUS[vacancy.status]} · {formatDate(vacancy.opened_on)}
                  </span>
                  <CloseVacancy vacancy={vacancy} />
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </section>
  );
}

function Candidates(): JSX.Element {
  const query = useHrQuery('/v1/hr/candidates', candidateListResponseSchema);
  return (
    <section aria-labelledby="candidates-title" className="space-y-3">
      <h2 id="candidates-title" className="text-lg font-semibold">
        Candidaturas
      </h2>
      <NewCandidate />
      <QueryState query={query} loadingLabel="Cargando candidaturas">
        {({ data }) =>
          data.length === 0 ? (
            <p>No hay candidaturas registradas.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {data.map((candidate) => (
                <li key={candidate.id} className="flex flex-wrap justify-between gap-2 p-3">
                  <span>
                    <strong>{candidate.name}</strong> · {candidate.vacancy.position}
                  </span>
                  <CandidateActions candidate={candidate} />
                  <span>
                    {CANDIDATE_STAGES[candidate.stage]}
                    {candidate.retention_until === null
                      ? null
                      : ` · Eliminación prevista ${formatDate(candidate.retention_until)}`}
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </section>
  );
}

function Employees(): JSX.Element {
  const query = useHrQuery('/v1/hr/employees', employeeListResponseSchema);
  return (
    <section aria-labelledby="employees-title" className="space-y-3">
      <h2 id="employees-title" className="text-lg font-semibold">
        Colaboradores
      </h2>
      <QueryState query={query} loadingLabel="Cargando colaboradores">
        {({ data }) =>
          data.length === 0 ? (
            <p>No hay colaboradores visibles.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {data.map((employee) => (
                <li key={employee.id} className="flex flex-wrap justify-between gap-2 p-3">
                  <Link
                    className="font-semibold underline"
                    href={`/app/talento-y-sst/colaboradores/${employee.id}`}
                  >
                    {employee.name}
                  </Link>
                  <span>
                    {employee.position.name} · {EMPLOYEE_STATUS[employee.status]}
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </section>
  );
}
