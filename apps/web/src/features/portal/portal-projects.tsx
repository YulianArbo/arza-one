'use client';

import type { PortalDeliverable, PortalProjectDetail, PortalProjectSummary } from '@arza/contracts';
import { EmptyState, HighlightCard } from '@arza/ui';
import { FolderKanban } from 'lucide-react';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import {
  ACCEPTANCE_STATUSES,
  BackLink,
  DELIVERABLE_STATUSES,
  Fact,
  MILESTONE_STATUSES,
  OpenCard,
  PROJECT_STATUSES,
  Progress,
  StatusBadge,
} from './portal-bits';
import { usePortalProject, usePortalProjects } from './portal-queries';
import { PORTAL_PATHS } from './portal-sections';

// Proyectos del cliente (B30, ficha 17.10): avance, próximos hitos y entregables con su acta. Nunca horas,
// dinero ni notas del equipo; el usuario del cliente ve solo los que su administrador le asignó.

function ProjectCard({ project }: { readonly project: PortalProjectSummary }): JSX.Element {
  return (
    <OpenCard href={PORTAL_PATHS.project(project.id)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-heading font-semibold">
          {project.name}
          <span className="block text-sm font-normal text-muted-foreground">{project.code}</span>
        </h2>
        <StatusBadge status={project.status} labels={PROJECT_STATUSES} />
      </div>
      <Progress percent={project.progress_pct} label="Avance" />
      <Fact label="Próximo hito">
        {project.next_milestone === null
          ? 'Sin hitos pendientes'
          : `${project.next_milestone.name} · ${formatDate(project.next_milestone.due_on)}`}
      </Fact>
      {project.awaiting_client > 0 ? (
        <Fact label="Actas que esperan su respuesta">{project.awaiting_client}</Fact>
      ) : null}
    </OpenCard>
  );
}

/** Resumen bajo el título (boceto 25): con un proyecto, su avance y su próximo hito. */
function projectsSummary(projects: readonly PortalProjectSummary[]): string {
  const [only] = projects;
  if (projects.length !== 1 || only === undefined) return 'Avance, hitos y entregables.';
  const next = only.next_milestone;
  const pct = `${String(only.progress_pct)} % de avance`;
  return next === null ? pct : `${pct} · próximo hito el ${formatDate(next.due_on)}`;
}

export function PortalProjectsPage(): JSX.Element {
  const projects = usePortalProjects();
  return (
    <>
      <PageHeader title="Proyectos" description={projectsSummary(projects.data?.data ?? [])} />
      <QueryState query={projects} loadingLabel="Cargando sus proyectos">
        {(data) =>
          data.data.length === 0 ? (
            <EmptyState
              icon={<FolderKanban />}
              title="Aún no hay proyectos para mostrar"
              description="Aquí verá sus proyectos desde que inicien. Si espera ver uno, pida a su administrador que se lo asigne."
            />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2" aria-label="Proyectos">
              {data.data.map((project) => (
                <li key={project.id}>
                  <ProjectCard project={project} />
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </>
  );
}

function DeliverableItem({
  deliverable,
}: {
  readonly deliverable: PortalDeliverable;
}): JSX.Element {
  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {deliverable.name}
          {deliverable.version_label === null ? null : (
            <span className="text-sm font-normal text-muted-foreground">
              {' '}
              · {deliverable.version_label}
            </span>
          )}
        </span>
        <StatusBadge status={deliverable.status} labels={DELIVERABLE_STATUSES} />
      </div>
      {deliverable.milestone === null ? null : <Fact label="Hito">{deliverable.milestone}</Fact>}
      {deliverable.acceptance === null ? null : (
        <Fact label="Acta">
          {ACCEPTANCE_STATUSES[deliverable.acceptance.status]} · responder antes del{' '}
          {formatDate(deliverable.acceptance.respond_by)}
        </Fact>
      )}
    </li>
  );
}

function MilestoneSection({ project }: { readonly project: PortalProjectDetail }): JSX.Element {
  return (
    <HighlightCard title="Hitos">
      {project.milestones.length === 0 ? (
        <p className="text-sm text-muted-foreground">El proyecto no tiene hitos todavía.</p>
      ) : (
        <ol className="flex flex-col divide-y">
          {project.milestones.map((milestone) => (
            <li
              key={milestone.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <span>
                {milestone.name}
                <span className="block text-sm text-muted-foreground">
                  {formatDate(milestone.due_on)}
                </span>
              </span>
              <StatusBadge status={milestone.status} labels={MILESTONE_STATUSES} />
            </li>
          ))}
        </ol>
      )}
    </HighlightCard>
  );
}

function DeliverableSection({ project }: { readonly project: PortalProjectDetail }): JSX.Element {
  return (
    <HighlightCard title="Entregables">
      {project.deliverables.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay entregables entregados.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {project.deliverables.map((deliverable) => (
            <DeliverableItem key={deliverable.id} deliverable={deliverable} />
          ))}
        </ul>
      )}
    </HighlightCard>
  );
}

function ProjectDetailView({ project }: { readonly project: PortalProjectDetail }): JSX.Element {
  return (
    <>
      <BackLink href={PORTAL_PATHS.projects} label="Volver a proyectos" />
      <PageHeader title={project.name} description={project.description ?? project.code} />
      <HighlightCard title="Avance" highlighted>
        <span className="self-start">
          <StatusBadge status={project.status} labels={PROJECT_STATUSES} />
        </span>
        <Progress percent={project.progress_pct} label="Avance de las tareas" />
        <Fact label="Desde">{formatDate(project.starts_on)}</Fact>
        <Fact label="Hasta">{formatDate(project.ends_on)}</Fact>
      </HighlightCard>
      <MilestoneSection project={project} />
      <DeliverableSection project={project} />
    </>
  );
}

export function PortalProjectPage({ id }: { readonly id: string }): JSX.Element {
  const project = usePortalProject(id);
  return (
    <QueryState query={project} loadingLabel="Cargando el proyecto">
      {(data) => <ProjectDetailView project={data} />}
    </QueryState>
  );
}
