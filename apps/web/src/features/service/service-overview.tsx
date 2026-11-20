'use client';

import { AttentionList, buttonVariants, HighlightCard, QuickLinks } from '@arza/ui';
import { Handshake, Ticket } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { visibleSubmodules } from '../../components/app-shell/submodules';
import { formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { usePermissions } from '../session/permissions';
import { SERVICE_PATHS } from './labels';
import { useTickets } from './queries';

// Parte de arriba de la bandeja de Servicio (B22B, boceto 10): los tiquetes por vencer, el recordatorio
// de la primera respuesta y las demás funciones del módulo. La bandeja completa sigue debajo.

const AT_RISK_SHOWN = '3';

const ALSO = new Set<string>([
  SERVICE_PATHS.warranties,
  SERVICE_PATHS.policies,
  SERVICE_PATHS.surveys,
]);

function AttentionInbox(): JSX.Element {
  const atRisk = useTickets({ view: 'at_risk', q: '', priority: '', limit: AT_RISK_SHOWN });
  return (
    <HighlightCard title="Bandeja de atención" description="Tiquetes por vencer.">
      <QueryState query={atRisk} loadingLabel="Cargando los tiquetes por vencer">
        {({ data }) =>
          data.length === 0 ? (
            <p className="text-muted-foreground">No hay tiquetes por vencer.</p>
          ) : (
            <AttentionList
              linkAs={Link}
              items={data.map((ticket) => ({
                id: ticket.id,
                title: ticket.subject,
                meta:
                  ticket.resolution_due_at === null
                    ? ticket.code
                    : `${ticket.code} · vence ${formatDateTime(ticket.resolution_due_at)}`,
                href: SERVICE_PATHS.ticket(ticket.id),
                icon: <Ticket />,
              }))}
            />
          )
        }
      </QueryState>
    </HighlightCard>
  );
}

function FirstResponse(): JSX.Element {
  return (
    <HighlightCard
      title="Primera respuesta"
      description="Revise los acuerdos de servicio y atienda primero los casos próximos a vencer."
      highlighted
    >
      <Link
        href={SERVICE_PATHS.policies}
        className={buttonVariants({ variant: 'outline', className: 'self-start' })}
      >
        <Handshake aria-hidden="true" />
        Ver acuerdos de tiempo
      </Link>
    </HighlightCard>
  );
}

/** Tiquetes por vencer, primera respuesta y «También en Servicio», para quien lee los tiquetes. */
export function ServiceOverview(): JSX.Element {
  const { granted, grantedAll } = usePermissions();
  const also = visibleSubmodules('servicio', granted, grantedAll)
    .filter((entry) => ALSO.has(entry.href))
    .map((entry) => ({ href: entry.href, label: entry.label, icon: <entry.icon /> }));
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <AttentionInbox />
        <FirstResponse />
      </div>
      {also.length > 0 ? (
        <QuickLinks title="También en Servicio" links={also} linkAs={Link} />
      ) : null}
    </div>
  );
}
