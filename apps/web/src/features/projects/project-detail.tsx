'use client';

import type { ProjectDetail } from '@arza/contracts';
import { Alert, AlertDescription, Badge, EmptyState } from '@arza/ui';
import { Clock } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { CONTRACT_PATHS } from '../contracts/labels';
import { FactsCard, factLink, type Fact } from '../crm/crm-facts';
import { formatPesos } from '../crm/labels';
import { partyPath } from '../parties/labels';
import { SectionTabs, type SectionTab } from '../parties/section-tabs';
import { BacklogPanel } from './backlog';
import { BoardPanel } from './board';
import {
  AUTHORIZATION_STATUSES,
  PROJECT_METHODOLOGIES,
  PROJECT_PATHS,
  PROJECT_STATUSES,
  PROJECT_STATUS_TONES,
  PROJECT_TYPES,
} from './labels';
import { LinksPanel } from './links-panel';
import { MilestonesPanel } from './milestones-panel';
import { ProjectActions } from './project-actions';
import { useProject } from './queries';
import { SprintsPanel } from './sprints-panel';
import { TeamPanel } from './team-panel';

// Ficha del proyecto (B26, numerales 16.3 y 16.4): estado, acciones permitidas y las secciones de
// la ficha 17.8 en pestañas. Horas, entregables, actas, riesgos y liberaciones llegan con el B27.

interface Props {
  readonly project: ProjectDetail;
}

/** Lo que está pasando y lo que sigue, en una frase. */
function statusMessage(project: ProjectDetail): string | null {
  const { status, authorization } = project;
  if (status === 'at_risk' || status === 'paused') {
    return `${PROJECT_STATUSES[status]}: ${project.status_reason ?? ''}`;
  }
  if (status !== 'planning') return null;
  if (authorization.status === 'requested') {
    return 'Esperando la autorización de la Dirección para iniciar (en Mis tareas).';
  }
  if (authorization.status === 'denied') {
    return `La Dirección no autorizó el inicio: «${authorization.note ?? ''}». Puede pedirla de nuevo.`;
  }
  if (project.contract === null) {
    return 'Sin contrato vigente: planee el proyecto y pida a la Dirección la autorización para iniciarlo.';
  }
  return 'En planeación. Arme el equipo, los hitos y la lista de pendientes, e inícielo cuando esté listo.';
}

function summaryFacts(project: ProjectDetail): Fact[] {
  const facts: Fact[] = [
    ['Cliente', factLink(partyPath(project.party.id), project.party.name)],
    [
      'Contrato',
      project.contract === null
        ? 'Sin contrato'
        : factLink(CONTRACT_PATHS.contract(project.contract.id), project.contract.code),
    ],
    ['Tipo', PROJECT_TYPES[project.type]],
    ['Metodología', PROJECT_METHODOLOGIES[project.methodology]],
    ['Fechas', `${formatDate(project.starts_on)} – ${formatDate(project.ends_on)}`],
    ['Líder', project.manager?.name ?? '—'],
    ['Presupuesto de horas', `${String(project.budget_hours).replace('.', ',')} h`],
    ['Presupuesto en pesos', formatPesos(project.budget_amount)],
    [
      'Avance',
      `${String(project.progress.percent)} % (${String(project.progress.done)} de ${String(project.progress.planned)} ítems terminados)`,
    ],
    ['Alcance', project.description ?? '—'],
    ['Creado', formatDateTime(project.created_at)],
  ];
  if (project.authorization.status !== 'none') {
    facts.push([
      'Autorización de la Dirección',
      AUTHORIZATION_STATUSES[project.authorization.status],
    ]);
  }
  return facts;
}

function ComingSoon(): JSX.Element {
  return (
    <EmptyState
      icon={<Clock />}
      title="Disponible pronto"
      description="El registro de horas, los entregables, las actas de entrega, los riesgos y las liberaciones llegan en la siguiente etapa."
    />
  );
}

function tabsOf(project: ProjectDetail): SectionTab[] {
  return [
    {
      id: 'resumen',
      label: 'Resumen',
      content: () => <FactsCard title="Datos del proyecto" facts={summaryFacts(project)} />,
    },
    { id: 'tablero', label: 'Tablero', content: () => <BoardPanel project={project} /> },
    { id: 'pendientes', label: 'Pendientes', content: () => <BacklogPanel project={project} /> },
    { id: 'iteraciones', label: 'Iteraciones', content: () => <SprintsPanel project={project} /> },
    { id: 'hitos', label: 'Hitos', content: () => <MilestonesPanel project={project} /> },
    { id: 'equipo', label: 'Equipo', content: () => <TeamPanel project={project} /> },
    { id: 'enlaces', label: 'Enlaces', content: () => <LinksPanel project={project} /> },
    { id: 'entregas', label: 'Horas y entregables', content: () => <ComingSoon /> },
  ];
}

function Detail({ project }: Props): JSX.Element {
  const message = statusMessage(project);
  return (
    <>
      <PageHeader title={project.code} description={`${project.name} · ${project.party.name}`} />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={PROJECT_STATUS_TONES[project.status]}>
          {PROJECT_STATUSES[project.status]}
        </Badge>
        <span className="text-sm text-muted-foreground">
          Avance {String(project.progress.percent)} %
        </span>
      </div>
      {message === null ? null : (
        <Alert tone={project.status === 'planning' ? 'info' : 'warning'}>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      <ProjectActions project={project} />
      <SectionTabs label="Secciones del proyecto" tabs={tabsOf(project)} />
    </>
  );
}

export function ProjectDetailPanel({ id }: { readonly id: string }): JSX.Element {
  const project = useProject(id);
  return (
    <div className="flex flex-col gap-4">
      <Link
        href={PROJECT_PATHS.list}
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        ← Volver a los proyectos
      </Link>
      <QueryState query={project} loadingLabel="Cargando el proyecto">
        {(data) => <Detail project={data} />}
      </QueryState>
    </div>
  );
}
