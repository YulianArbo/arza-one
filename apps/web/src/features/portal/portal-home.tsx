'use client';

import type { PortalHome } from '@arza/contracts';
import { Card, CardContent, EmptyState, buttonVariants } from '@arza/ui';
import { CalendarClock, Headset } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { usePermissions } from '../session/permissions';
import { MainProjectCard, ReviewCard } from './portal-home-cards';
import { usePortalHome } from './portal-queries';
import { PORTAL_PATHS } from './portal-sections';

// Inicio del cliente (B30, ficha 17.10; B22B F5b, bocetos 24 y 29): el avance de su proyecto, lo
// que espera su respuesta, el acceso a soporte y los próximos hitos.

function Milestones({ home }: { readonly home: PortalHome }): JSX.Element {
  if (home.next_milestones.length === 0) {
    return (
      <EmptyState
        icon={<CalendarClock />}
        title="Sin hitos próximos"
        description="Cuando sus proyectos tengan hitos por cumplir, los verá aquí."
      />
    );
  }
  return (
    <Card>
      <CardContent className="p-4">
        <ol className="flex flex-col divide-y" aria-label="Próximos hitos">
          {home.next_milestones.map((milestone) => (
            <li
              key={`${milestone.project_id}-${milestone.name}`}
              className="flex flex-wrap justify-between gap-2 py-2"
            >
              <Link
                href={PORTAL_PATHS.project(milestone.project_id)}
                className="font-medium hover:underline"
              >
                {milestone.name}
                <span className="block text-sm font-normal text-muted-foreground">
                  {milestone.project}
                </span>
              </Link>
              <span className="text-sm tabular-nums">{formatDate(milestone.due_on)}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function SupportLink(): JSX.Element | null {
  if (!usePermissions().can('portal.ticket.read')) return null;
  return (
    <Link
      href={PORTAL_PATHS.support}
      className={buttonVariants({ variant: 'outline', className: 'self-start' })}
    >
      <Headset aria-hidden="true" />
      Consultar soporte
    </Link>
  );
}

export function PortalHomePage(): JSX.Element {
  const home = usePortalHome();
  return (
    <QueryState query={home} loadingLabel="Cargando su resumen">
      {(data) => (
        <>
          <PageHeader
            eyebrow={data.company}
            title="Su espacio de cliente"
            description="Consulte el avance de su proyecto y los documentos que requieren atención."
          />
          <div className="grid gap-4 lg:grid-cols-3">
            <MainProjectCard />
            <ReviewCard home={data} />
          </div>
          <SupportLink />
          <section className="flex flex-col gap-3" aria-labelledby="hitos-titulo">
            <h2 id="hitos-titulo" className="font-heading text-lg font-semibold">
              Próximos hitos
            </h2>
            <Milestones home={data} />
          </section>
        </>
      )}
    </QueryState>
  );
}
