'use client';

import type { TicketDetail } from '@arza/contracts';
import { Alert, AlertDescription, Badge } from '@arza/ui';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { FactsCard, factLink, type Fact } from '../crm/crm-facts';
import { partyPath } from '../parties/labels';
import { SectionTabs, type SectionTab } from '../parties/section-tabs';
import { PROJECT_PATHS } from '../projects/labels';
import {
  CLOCK_STATES,
  CLOCK_TONES,
  PRIORITY_TONES,
  SLA_CALENDARS,
  TICKET_CATEGORIES,
  TICKET_CHANNELS,
  levelLabel,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_STATUS_TONES,
  TICKET_SURVEY_STATES,
} from './labels';
import { useTicket } from './queries';
import { BackLink, hoursText } from './service-bits';
import { TicketActions } from './ticket-actions';
import { TicketCompensations } from './ticket-compensations';
import { TicketConversation } from './ticket-conversation';

// Ficha del tiquete (B28, numerales 16.3 y 16.4): estado, reloj del acuerdo, acciones permitidas,
// la conversación y, para el equipo, las compensaciones.

interface Props {
  readonly ticket: TicketDetail;
}

function due(at: string | null): string {
  return at === null ? 'En pausa' : formatDateTime(at);
}

/** Lo que está pasando con el reloj, en una frase. */
function clockMessage(ticket: TicketDetail): { tone: 'info' | 'warning'; text: string } | null {
  if (ticket.clock === 'paused') {
    return {
      tone: 'info',
      text: 'En espera del cliente: el reloj está pausado y sigue al reanudar.',
    };
  }
  if (ticket.clock === 'overdue') {
    return { tone: 'warning', text: 'Venció el plazo de solución. Atiéndalo o escálelo.' };
  }
  if (ticket.clock === 'at_risk') {
    return { tone: 'warning', text: 'Consumió el 80 % del plazo de solución.' };
  }
  if (ticket.status === 'resolved' && ticket.auto_close_at !== null) {
    return {
      tone: 'info',
      text: `Resuelto: se cierra solo el ${formatDateTime(ticket.auto_close_at)} si nadie lo reabre.`,
    };
  }
  return null;
}

/** La encuesta que llegó al resolverlo (B29), en una frase. */
function surveyText(ticket: TicketDetail): string {
  const survey = ticket.survey;
  if (survey === null) return 'Aún no se envía (sale al resolverlo)';
  if (survey.state !== 'answered') return TICKET_SURVEY_STATES[survey.state];
  return `Respondida: recomendación ${String(survey.score)} de 10, satisfacción ${String(survey.satisfaction)} de 5`;
}

function linkFacts(ticket: TicketDetail): Fact[] {
  return [
    [
      'Cliente',
      ticket.party === null ? 'Interno' : factLink(partyPath(ticket.party.id), ticket.party.name),
    ],
    ['Quién reporta', ticket.requester_name ?? ticket.requester?.name ?? '—'],
    ['Correo de quien reporta', ticket.requester_email ?? '—'],
    [
      'Proyecto',
      ticket.project === null
        ? '—'
        : factLink(
            PROJECT_PATHS.project(ticket.project.id),
            `${ticket.project.code} · ${ticket.project.name}`,
          ),
    ],
    ['Entregable', ticket.deliverable?.name ?? '—'],
    [
      'Garantía',
      ticket.warranty === null
        ? 'Sin garantía'
        : `${ticket.in_warranty ? 'Vigente' : 'Vencida'} hasta el ${formatDate(ticket.warranty.ends_on)}`,
    ],
  ];
}

function summaryFacts(ticket: TicketDetail): Fact[] {
  return [
    ['Asunto', ticket.subject],
    ['Descripción', ticket.description],
    ['Categoría', TICKET_CATEGORIES[ticket.category]],
    ['Canal', TICKET_CHANNELS[ticket.channel]],
    ['Nivel', levelLabel(ticket.level)],
    ['Responsable', ticket.assignee?.name ?? 'Sin asignar'],
    ...linkFacts(ticket),
    [
      'Acuerdo de tiempo',
      `${hoursText(ticket.sla.first_response_hours)} para responder y ${hoursText(ticket.sla.resolution_hours)} para resolver (${SLA_CALENDARS[ticket.sla.calendar].toLowerCase()})`,
    ],
    [
      'Primera respuesta',
      ticket.first_response_at === null
        ? `Vence ${due(ticket.response_due_at)}`
        : `Dada el ${formatDateTime(ticket.first_response_at)}`,
    ],
    ['Solución vence', ticket.resolved_at === null ? due(ticket.resolution_due_at) : '—'],
    ['Solución', ticket.resolution ?? '—'],
    ['Encuesta de satisfacción', surveyText(ticket)],
    ['Registrado', `${formatDateTime(ticket.created_at)} por ${ticket.created_by?.name ?? '—'}`],
  ];
}

function tabsOf(ticket: TicketDetail): SectionTab[] {
  const tabs: SectionTab[] = [
    {
      id: 'conversacion',
      label: 'Conversación',
      content: () => <TicketConversation ticket={ticket} />,
    },
    {
      id: 'datos',
      label: 'Datos',
      content: () => <FactsCard title="Datos del tiquete" facts={summaryFacts(ticket)} />,
    },
  ];
  if (ticket.can.propose_compensation || ticket.can.decide_compensation) {
    tabs.push({
      id: 'compensaciones',
      label: 'Compensaciones',
      content: () => <TicketCompensations ticket={ticket} />,
    });
  }
  return tabs;
}

function Detail({ ticket }: Props): JSX.Element {
  const message = clockMessage(ticket);
  return (
    <>
      <PageHeader title={ticket.code} description={ticket.subject} />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={TICKET_STATUS_TONES[ticket.status]}>{TICKET_STATUSES[ticket.status]}</Badge>
        <Badge tone={PRIORITY_TONES[ticket.priority]}>
          Prioridad {TICKET_PRIORITIES[ticket.priority].toLowerCase()}
        </Badge>
        <Badge tone={CLOCK_TONES[ticket.clock]}>{CLOCK_STATES[ticket.clock]}</Badge>
        <span className="text-sm text-muted-foreground">Nivel {String(ticket.level)}</span>
        {ticket.in_warranty ? <Badge tone="success">En garantía</Badge> : null}
      </div>
      {message === null ? null : (
        <Alert tone={message.tone}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}
      <TicketActions ticket={ticket} />
      <SectionTabs label="Secciones del tiquete" tabs={tabsOf(ticket)} />
    </>
  );
}

export function TicketDetailPanel({ id }: { readonly id: string }): JSX.Element {
  const ticket = useTicket(id);
  return (
    <div className="flex flex-col gap-4">
      <BackLink />
      <QueryState query={ticket} loadingLabel="Cargando el tiquete">
        {(data) => <Detail ticket={data} />}
      </QueryState>
    </div>
  );
}
