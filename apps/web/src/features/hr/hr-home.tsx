'use client';

import {
  CANDIDATE_STAGES,
  EMPLOYEE_STATUS,
  VACANCY_STATUS,
  candidateListResponseSchema,
  employeeListResponseSchema,
  vacancyListResponseSchema,
} from '@arza/contracts';
import { HighlightCard, QuickLinks, type QuickLink } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { visibleSubmodules } from '../../components/app-shell/submodules';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { usePermissions } from '../session/permissions';
import { useHrQuery } from './hr-queries';
import { CandidateActions, NewCandidate } from './candidate-forms';
import { CloseVacancy, NewVacancy } from './vacancy-forms';

// Mi espacio no es parte de Talento, pero quien ve colaboradores lo usa a diario (B36).
const MY_SPACE: QuickLink = { href: '/app/mi-espacio', label: 'Mi espacio' };

/** Portada de Talento y SST (B22B, boceto 12): selección arriba, colaboradores y accesos debajo. */
export function HrHome(): JSX.Element {
  const { can, granted, grantedAll } = usePermissions();
  const links: QuickLink[] = [
    ...(can('hr.employee.read') ? [MY_SPACE] : []),
    ...visibleSubmodules('talento-y-sst', granted, grantedAll).map((entry) => ({
      href: entry.href,
      label: entry.label,
      icon: <entry.icon />,
    })),
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Talento y SST"
        description="Pase de las vacantes abiertas a la selección y la activación del expediente laboral."
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {can('hr.vacancy.manage') ? <Vacancies /> : null}
        {can('hr.candidate.manage') ? <Candidates /> : null}
      </div>
      {can('hr.employee.read') ? <Employees /> : null}
      {links.length > 0 ? (
        <QuickLinks title="También en Talento y SST" links={links} linkAs={Link} />
      ) : null}
    </div>
  );
}

function Vacancies(): JSX.Element {
  const query = useHrQuery('/v1/hr/vacancies', vacancyListResponseSchema);
  return (
    <HighlightCard title="Vacantes">
      <NewVacancy />
      <QueryState query={query} loadingLabel="Cargando vacantes">
        {({ data }) =>
          data.length === 0 ? (
            <p>No hay vacantes registradas.</p>
          ) : (
            <ul className="divide-y">
              {data.map((vacancy) => (
                <li key={vacancy.id} className="flex flex-wrap justify-between gap-2 py-3">
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
    </HighlightCard>
  );
}

function Candidates(): JSX.Element {
  const query = useHrQuery('/v1/hr/candidates', candidateListResponseSchema);
  return (
    <HighlightCard title="Candidaturas" highlighted>
      <NewCandidate />
      <QueryState query={query} loadingLabel="Cargando candidaturas">
        {({ data }) =>
          data.length === 0 ? (
            <p>No hay candidaturas registradas.</p>
          ) : (
            <ul className="divide-y">
              {data.map((candidate) => (
                <li key={candidate.id} className="flex flex-wrap justify-between gap-2 py-3">
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
    </HighlightCard>
  );
}

function Employees(): JSX.Element {
  const query = useHrQuery('/v1/hr/employees', employeeListResponseSchema);
  return (
    <HighlightCard title="Colaboradores">
      <QueryState query={query} loadingLabel="Cargando colaboradores">
        {({ data }) =>
          data.length === 0 ? (
            <p>No hay colaboradores visibles.</p>
          ) : (
            <ul className="divide-y">
              {data.map((employee) => (
                <li key={employee.id} className="flex flex-wrap justify-between gap-2 py-3">
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
    </HighlightCard>
  );
}
