'use client';

import {
  KB_CATEGORIES,
  PQRSF_TYPES,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type PortalPqrsf,
  type PortalTicketSummary,
} from '@arza/contracts';
import { EmptyState, FormField, HighlightCard } from '@arza/ui';
import { BookOpen, LifeBuoy, MessageSquareWarning } from 'lucide-react';
import { useState, type JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { usePermissions } from '../session/permissions';
import { Fact, OpenCard, PQRSF_STATUSES, StatusBadge, TICKET_STATUSES } from './portal-bits';
import { usePortalArticles, usePortalPqrsf, usePortalTickets } from './portal-queries';
import { PORTAL_PATHS } from './portal-sections';
import { NewPqrsf, NewTicket } from './portal-support-forms';

// Soporte en el portal (B30): sus solicitudes, sus PQRSF y los artículos de ayuda para clientes.
// Pedir soporte y radicar una PQRSF se hace en un diálogo; la API los registra a su nombre.

function TicketCard({ ticket }: { readonly ticket: PortalTicketSummary }): JSX.Element {
  return (
    <OpenCard href={PORTAL_PATHS.ticket(ticket.id)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-heading font-semibold">
          {ticket.subject}
          <span className="block text-sm font-normal text-muted-foreground">{ticket.code}</span>
        </h3>
        <StatusBadge status={ticket.status} labels={TICKET_STATUSES} />
      </div>
      <Fact label="Categoría">{TICKET_CATEGORIES[ticket.category]}</Fact>
      <Fact label="Prioridad">{TICKET_PRIORITIES[ticket.priority]}</Fact>
      {ticket.requester === null ? null : <Fact label="Pidió">{ticket.requester}</Fact>}
      <Fact label="Actualizado">{formatDateTime(ticket.updated_at)}</Fact>
    </OpenCard>
  );
}

function Tickets(): JSX.Element {
  const tickets = usePortalTickets();
  return (
    <QueryState query={tickets} loadingLabel="Cargando sus solicitudes">
      {(data) =>
        data.data.length === 0 ? (
          <EmptyState
            icon={<LifeBuoy />}
            title="Sin solicitudes de soporte"
            description="Cuando necesite ayuda, pídala con el botón «Pedir soporte»."
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2" aria-label="Solicitudes de soporte">
            {data.data.map((ticket) => (
              <li key={ticket.id}>
                <TicketCard ticket={ticket} />
              </li>
            ))}
          </ul>
        )
      }
    </QueryState>
  );
}

function PqrsfItem({ pqrsf }: { readonly pqrsf: PortalPqrsf }): JSX.Element {
  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {pqrsf.subject}
          <span className="block text-sm font-normal text-muted-foreground">
            {PQRSF_TYPES[pqrsf.type]} · {pqrsf.code}
          </span>
        </span>
        <StatusBadge status={pqrsf.status} labels={PQRSF_STATUSES} />
      </div>
      <Fact label="Respuesta a más tardar">{formatDate(pqrsf.due_on)}</Fact>
      {pqrsf.response === null ? null : (
        <p className="rounded-xl bg-muted p-3 text-sm whitespace-pre-wrap">{pqrsf.response}</p>
      )}
    </li>
  );
}

function PqrsfList(): JSX.Element {
  const list = usePortalPqrsf();
  return (
    <QueryState query={list} loadingLabel="Cargando sus PQRSF">
      {(data) =>
        data.data.length === 0 ? (
          <EmptyState
            icon={<MessageSquareWarning />}
            title="No ha radicado PQRSF"
            description="Si tiene una petición, queja, reclamo, sugerencia o felicitación, radíquela aquí."
          />
        ) : (
          <ul className="flex flex-col divide-y" aria-label="Sus PQRSF">
            {data.data.map((pqrsf) => (
              <PqrsfItem key={pqrsf.id} pqrsf={pqrsf} />
            ))}
          </ul>
        )
      }
    </QueryState>
  );
}

function Articles(): JSX.Element {
  const [search, setSearch] = useState('');
  const articles = usePortalArticles(search);
  return (
    <div className="flex flex-col gap-3">
      <FormField
        id="ayuda-buscar"
        label="Buscar en la ayuda"
        type="search"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
        }}
      />
      <QueryState query={articles} loadingLabel="Cargando la ayuda">
        {(data) =>
          data.data.length === 0 ? (
            <EmptyState
              icon={<BookOpen />}
              title="No encontramos artículos"
              description="Pruebe con otras palabras o pida soporte."
            />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2" aria-label="Artículos de ayuda">
              {data.data.map((article) => (
                <li key={article.id}>
                  <OpenCard href={PORTAL_PATHS.article(article.id)}>
                    <h3 className="font-heading font-semibold">{article.title}</h3>
                    <p className="text-sm text-muted-foreground">{article.summary}</p>
                    <Fact label="Tema">{KB_CATEGORIES[article.category]}</Fact>
                  </OpenCard>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </div>
  );
}

export function PortalSupportPage(): JSX.Element {
  const permissions = usePermissions();
  const canCreate = permissions.can('portal.ticket.create');
  return (
    <>
      <PageHeader
        title="Soporte"
        description="Sus solicitudes, sus PQRSF y artículos de ayuda."
        action={canCreate ? <NewTicket /> : undefined}
      />
      <HighlightCard title="Solicitudes">
        <Tickets />
      </HighlightCard>
      <HighlightCard title="Peticiones, quejas, reclamos, sugerencias y felicitaciones">
        {canCreate ? (
          <div className="self-start">
            <NewPqrsf />
          </div>
        ) : null}
        <PqrsfList />
      </HighlightCard>
      <HighlightCard title="Ayuda">
        <Articles />
      </HighlightCard>
    </>
  );
}
