'use client';

import {
  KB_CATEGORIES,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type PortalTicketDetail,
  type PortalTicketMessage,
} from '@arza/contracts';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  TextareaField,
  HighlightCard,
} from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { BackLink, Fact, StatusBadge, TICKET_STATUSES } from './portal-bits';
import { usePortalAction, usePortalArticle, usePortalTicket } from './portal-queries';
import { PORTAL_PATHS } from './portal-sections';

// Una solicitud de soporte en el portal (B30, decisión 7): la conversación pública con el equipo
// (nunca sus notas internas) y la respuesta del cliente, que reanuda el reloj si esperaba por usted.

function MessageItem({ message }: { readonly message: PortalTicketMessage }): JSX.Element {
  return (
    <li className={`rounded-xl border p-3 ${message.from_client ? '' : 'bg-muted'}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge tone={message.from_client ? 'info' : 'neutral'}>
          {message.from_client ? 'Usted o su empresa' : 'Soporte'}
        </Badge>
        <span>{message.author}</span>
        <span>· {formatDateTime(message.created_at)}</span>
      </div>
      <p className="mt-2 text-sm whitespace-pre-wrap">{message.body}</p>
    </li>
  );
}

function Reply({ ticket }: { readonly ticket: PortalTicketDetail }): JSX.Element {
  const api = useApiClient();
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const send = usePortalAction<string>(
    async (body, csrfToken) => {
      await api.post(`/v1/portal/tickets/${ticket.id}/messages`, { body: { body }, csrfToken });
    },
    () => {
      setText('');
    },
  );
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const empty = text.trim() === '';
    setProblem(empty ? 'Escriba el mensaje.' : null);
    if (!empty) send.execute(text.trim());
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3">
      <TextareaField
        id="respuesta-cliente"
        label="Su respuesta"
        value={text}
        error={problem}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
      {send.error === null ? null : <FormError error={send.error} />}
      <div>
        <Button type="submit" disabled={send.pending}>
          {send.pending ? 'Enviando…' : 'Enviar respuesta'}
        </Button>
      </div>
      {send.dialog}
    </form>
  );
}

function TicketFacts({ ticket }: { readonly ticket: PortalTicketDetail }): JSX.Element {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <StatusBadge status={ticket.status} labels={TICKET_STATUSES} />
        <Fact label="Tipo">{TICKET_CATEGORIES[ticket.category]}</Fact>
        <Fact label="Urgencia">{TICKET_PRIORITIES[ticket.priority]}</Fact>
        {ticket.project === null ? null : <Fact label="Proyecto">{ticket.project}</Fact>}
        <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
        {ticket.resolution === null ? null : (
          <p className="rounded-xl bg-muted p-3 text-sm">Solución: {ticket.resolution}</p>
        )}
      </CardContent>
    </Card>
  );
}

function TicketView({ ticket }: { readonly ticket: PortalTicketDetail }): JSX.Element {
  return (
    <>
      <BackLink href={PORTAL_PATHS.support} label="Volver a Soporte" />
      <PageHeader title={ticket.subject} description={ticket.code} />
      {ticket.status === 'waiting_customer' ? (
        <Alert tone="warning">
          <AlertDescription>Esta solicitud espera su respuesta.</AlertDescription>
        </Alert>
      ) : null}
      <TicketFacts ticket={ticket} />
      <HighlightCard title="Conversación">
        {ticket.messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay mensajes del equipo de soporte.
          </p>
        ) : (
          <ol className="flex flex-col gap-3" aria-label="Conversación">
            {ticket.messages.map((message) => (
              <MessageItem key={message.id} message={message} />
            ))}
          </ol>
        )}
        {ticket.can_reply ? <Reply ticket={ticket} /> : null}
      </HighlightCard>
    </>
  );
}

export function PortalTicketPage({ id }: { readonly id: string }): JSX.Element {
  const ticket = usePortalTicket(id);
  return (
    <QueryState query={ticket} loadingLabel="Cargando la solicitud">
      {(data) => <TicketView ticket={data} />}
    </QueryState>
  );
}

export function PortalArticlePage({ id }: { readonly id: string }): JSX.Element {
  const article = usePortalArticle(id);
  return (
    <QueryState query={article} loadingLabel="Cargando el artículo">
      {(data) => (
        <>
          <BackLink href={PORTAL_PATHS.support} label="Volver a Soporte" />
          <PageHeader title={data.title} description={KB_CATEGORIES[data.category]} />
          <Card>
            <CardContent className="p-4 text-sm whitespace-pre-wrap">{data.body}</CardContent>
          </Card>
        </>
      )}
    </QueryState>
  );
}
