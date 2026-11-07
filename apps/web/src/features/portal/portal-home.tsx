'use client';

import type { PortalHome } from '@arza/contracts';
import { Card, CardContent, EmptyState, StatCard } from '@arza/ui';
import { CalendarClock } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { usePermissions } from '../session/permissions';
import { PORTAL_PATHS } from './portal-sections';
import { usePortalHome } from './portal-queries';

// Inicio del cliente (B30, ficha 17.10): sus proyectos, los próximos hitos y lo que espera su
// respuesta, con un enlace a cada sección donde lo resuelve.

interface Pending {
  readonly label: string;
  readonly value: number;
  readonly href: string;
  readonly permission: string;
}

function pendingOf(home: PortalHome): Pending[] {
  return [
    {
      label: 'Proyectos',
      value: home.projects,
      href: PORTAL_PATHS.projects,
      permission: 'portal.project.read',
    },
    {
      label: 'Actas por aprobar',
      value: home.pending.approvals,
      href: PORTAL_PATHS.approvals,
      permission: 'portal.contract.read',
    },
    {
      label: 'Documentos por firmar',
      value: home.pending.signatures,
      href: PORTAL_PATHS.signatures,
      permission: 'portal.contract.read',
    },
    {
      label: 'Solicitudes que esperan su respuesta',
      value: home.pending.waiting_tickets,
      href: PORTAL_PATHS.support,
      permission: 'portal.ticket.read',
    },
  ];
}

function PendingCards({ home }: { readonly home: PortalHome }): JSX.Element {
  const permissions = usePermissions();
  const cards = pendingOf(home).filter((card) => permissions.can(card.permission));
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Su resumen">
      {cards.map((card) => (
        <li key={card.label}>
          <Link href={card.href} className="block rounded-xl">
            <StatCard label={card.label} value={String(card.value)} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

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

export function PortalHomePage(): JSX.Element {
  const home = usePortalHome();
  return (
    <QueryState query={home} loadingLabel="Cargando su resumen">
      {(data) => (
        <>
          <PageHeader title={`Bienvenido, ${data.company}`} description="Su resumen." />
          <PendingCards home={data} />
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
