'use client';

import type { ProjectSummary } from '@arza/contracts';
import { AttentionList, buttonVariants, HighlightCard } from '@arza/ui';
import { FolderKanban } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { formatDate } from '../../lib/format/date-time';
import { PROJECT_PATHS } from './labels';
import { useProjects } from './queries';

// Cartera activa de la portada de Proyectos (B22B, boceto 09): los proyectos en ejecución con su
// avance y, destacado, el primero de ellos. La lista completa, con búsqueda y filtros, sigue debajo.

const SHOWN = '4';

function FeaturedProject({ project }: { readonly project: ProjectSummary }): JSX.Element {
  const percent = project.progress.percent;
  return (
    <HighlightCard title={project.name} description={project.party.name}>
      <p className="text-5xl font-semibold tracking-tight tabular-nums">{percent} %</p>
      <div
        role="meter"
        aria-label={`Avance de ${project.name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${String(percent)} % de avance`}
        className="h-3 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${String(percent)}%` }} />
      </div>
      <p className="text-muted-foreground">
        {project.progress.done} de {project.progress.planned} elementos terminados · termina el{' '}
        {formatDate(project.ends_on)}
      </p>
      <Link
        href={PROJECT_PATHS.project(project.id)}
        className={buttonVariants({ variant: 'outline', className: 'self-start' })}
      >
        Ver el proyecto {project.code}
      </Link>
    </HighlightCard>
  );
}

/** Proyectos en ejecución que la persona puede ver. Sin ninguno, no ocupa lugar. */
export function ProjectPortfolio(): JSX.Element | null {
  const active = useProjects({ q: '', status: 'in_progress', limit: SHOWN });
  const projects = active.data?.data ?? [];
  const [featured] = projects;
  if (featured === undefined) return null;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.75fr)]">
      <HighlightCard title="Cartera activa">
        <AttentionList
          linkAs={Link}
          items={projects.map((project) => ({
            id: project.id,
            title: project.name,
            meta: `${String(project.progress.percent)} % de avance`,
            href: PROJECT_PATHS.project(project.id),
            icon: <FolderKanban />,
          }))}
        />
      </HighlightCard>
      <FeaturedProject project={featured} />
    </div>
  );
}
