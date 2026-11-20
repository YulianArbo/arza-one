'use client';

import type { PortalHome, PortalProjectSummary } from '@arza/contracts';
import { EmptyState, HighlightCard, buttonVariants } from '@arza/ui';
import { ArrowUpRight, ClipboardCheck, FolderKanban, Headset, PenLine } from 'lucide-react';
import Link from 'next/link';
import { createElement, type JSX } from 'react';

import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { usePermissions } from '../session/permissions';
import { Progress } from './portal-bits';
import { usePortalProjects } from './portal-queries';
import { PORTAL_PATHS } from './portal-sections';

// Tarjetas del inicio del cliente (B22B F5b, bocetos 24 y 29): el avance del proyecto principal
// y lo que espera su respuesta. Clara con borde azul, nunca oscura (decisión del dueño).

/** El proyecto que se destaca: el abierto con el hito más cercano; si no hay, el primero. */
export function mainProject(
  projects: readonly PortalProjectSummary[],
): PortalProjectSummary | undefined {
  const open = projects.filter((project) => project.status !== 'closed');
  const dated = open
    .filter((project) => project.next_milestone !== null)
    .sort((a, b) => (a.next_milestone?.due_on ?? '').localeCompare(b.next_milestone?.due_on ?? ''));
  return dated[0] ?? open[0] ?? projects[0];
}

function ProjectHighlight({ project }: { readonly project: PortalProjectSummary }): JSX.Element {
  const milestone = project.next_milestone;
  return (
    <HighlightCard title={project.name} highlighted className="lg:col-span-2">
      <p className="font-heading text-display font-semibold tabular-nums">
        {project.progress_pct} %
      </p>
      <Progress percent={project.progress_pct} label="Avance del proyecto" />
      <p className="text-muted-foreground">
        {milestone === null
          ? 'Sin hitos pendientes.'
          : `${milestone.name} prevista el ${formatDate(milestone.due_on)}.`}
      </p>
      <Link
        href={PORTAL_PATHS.projects}
        className={buttonVariants({ variant: 'outline', className: 'self-start' })}
      >
        <FolderKanban aria-hidden="true" />
        Ver mis proyectos
      </Link>
    </HighlightCard>
  );
}

/** El proyecto principal del cliente, con su avance y su próximo hito. */
export function MainProjectCard(): JSX.Element {
  const projects = usePortalProjects();
  return (
    <QueryState query={projects} loadingLabel="Cargando el avance de su proyecto">
      {(data) => {
        const project = mainProject(data.data);
        return project === undefined ? (
          <div className="lg:col-span-2">
            <EmptyState
              icon={<FolderKanban />}
              title="Aún no hay proyectos para mostrar"
              description="Aquí verá el avance de su proyecto desde que inicie."
            />
          </div>
        ) : (
          <ProjectHighlight project={project} />
        );
      }}
    </QueryState>
  );
}

interface ReviewItem {
  readonly count: number;
  readonly label: string;
  readonly href: string;
  readonly permission: string;
  readonly icon: typeof ClipboardCheck;
}

function reviewItems(home: PortalHome): ReviewItem[] {
  const { approvals, signatures, waiting_tickets: tickets } = home.pending;
  return [
    {
      count: approvals,
      label: approvals === 1 ? 'acta de entrega por aprobar' : 'actas de entrega por aprobar',
      href: PORTAL_PATHS.approvals,
      permission: 'portal.contract.read',
      icon: ClipboardCheck,
    },
    {
      count: signatures,
      label: signatures === 1 ? 'documento por firmar' : 'documentos por firmar',
      href: PORTAL_PATHS.signatures,
      permission: 'portal.contract.read',
      icon: PenLine,
    },
    {
      count: tickets,
      label: tickets === 1 ? 'solicitud espera su respuesta' : 'solicitudes esperan su respuesta',
      href: PORTAL_PATHS.support,
      permission: 'portal.ticket.read',
      icon: Headset,
    },
  ];
}

/** «Por revisar»: lo que espera la respuesta del cliente, con un enlace a donde lo resuelve. */
export function ReviewCard({ home }: { readonly home: PortalHome }): JSX.Element {
  const permissions = usePermissions();
  const items = reviewItems(home).filter((item) => permissions.can(item.permission));
  const pending = items.filter((item) => item.count > 0);
  return (
    <HighlightCard title="Por revisar">
      {pending.length === 0 ? (
        <p className="text-muted-foreground">No tiene nada pendiente por revisar.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {pending.map(({ label, count, href, icon }) => (
            <li key={href}>
              <Link href={href} className="flex items-center gap-2 py-2 hover:underline">
                {createElement(icon, {
                  'aria-hidden': true,
                  className: 'size-4 shrink-0 text-muted-foreground',
                })}
                <span className="font-medium">{`${String(count)} ${label}`}</span>
                <ArrowUpRight aria-hidden="true" className="size-4 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {permissions.can('portal.contract.read') ? (
        <Link
          href={PORTAL_PATHS.approvals}
          className={buttonVariants({ variant: 'outline', className: 'mt-auto' })}
        >
          <ArrowUpRight aria-hidden="true" />
          Abrir aprobaciones
        </Link>
      ) : null}
    </HighlightCard>
  );
}
