'use client';

import type { TicketDetail, TicketMessage } from '@arza/contracts';
import { Badge, Button, EmptyState, SelectField, TextareaField } from '@arza/ui';
import { MessagesSquare } from 'lucide-react';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { useServiceAction, useTicketMessages } from './queries';

// Conversación del tiquete (B28): mensajes al cliente, que verá en el portal (B30), notas internas
// que solo ve el equipo y lo que el cliente respondió por correo o teléfono. No se editan ni se
// borran. El primer mensaje al cliente cuenta como primera respuesta; la respuesta del cliente
// reanuda el reloj.

interface Props {
  readonly ticket: TicketDetail;
}

const KINDS = {
  public: 'Mensaje al cliente',
  internal: 'Nota interna (el cliente no la ve)',
  client: 'Respuesta del cliente (por correo o teléfono)',
} as const;

type Kind = keyof typeof KINDS;

function kindOf(message: TicketMessage): string {
  if (message.is_internal) return 'Nota interna';
  return message.from_client ? 'Cliente' : 'Al cliente';
}

function MessageItem({ message }: { readonly message: TicketMessage }): JSX.Element {
  return (
    <li className={`rounded-xl border border-border p-3 ${message.is_internal ? 'bg-muted' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge tone={message.is_internal ? 'warning' : message.from_client ? 'info' : 'neutral'}>
          {kindOf(message)}
        </Badge>
        <span>{message.author?.name ?? 'Sistema'}</span>
        <span>· {formatDateTime(message.created_at)}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm">{message.body}</p>
    </li>
  );
}

function bodyFor(kind: Kind, text: string): object {
  return { body: text, is_internal: kind === 'internal', from_client: kind === 'client' };
}

const KIND_OPTIONS = (Object.keys(KINDS) as Kind[]).map((value) => ({
  value,
  label: KINDS[value],
}));

function isKind(value: string): value is Kind {
  return value in KINDS;
}

/** El mensaje que se escribe, su tipo y su envío. */
function useComposer(ticket: TicketDetail) {
  const api = useApiClient();
  const [kind, setKind] = useState<Kind>('public');
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const send = useServiceAction<object>(
    async (body, csrfToken) => {
      await api.post(`/v1/tickets/${ticket.id}/messages`, { body, csrfToken });
    },
    () => {
      setText('');
    },
  );
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setProblem(text.trim() === '' ? 'Escriba el mensaje.' : null);
    if (text.trim() === '') return;
    send.execute(bodyFor(ticket.can.write_internal ? kind : 'public', text.trim()));
  };
  return { kind, setKind, text, setText, problem, send, submit };
}

function Composer({ ticket }: Props): JSX.Element {
  const { kind, setKind, text, setText, problem, send, submit } = useComposer(ticket);
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3">
      {ticket.can.write_internal ? (
        <SelectField
          id="mensaje-tipo"
          label="Tipo de mensaje"
          options={KIND_OPTIONS}
          value={kind}
          onChange={(event) => {
            if (isKind(event.target.value)) setKind(event.target.value);
          }}
        />
      ) : null}
      <TextareaField
        id="mensaje-texto"
        label="Mensaje"
        value={text}
        error={problem}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
      {send.error === null ? null : <FormError error={send.error} />}
      <div>
        <Button type="submit" variant="outline" disabled={send.pending}>
          {send.pending ? 'Enviando…' : 'Agregar a la conversación'}
        </Button>
      </div>
      {send.dialog}
    </form>
  );
}

export function TicketConversation({ ticket }: Props): JSX.Element {
  const messages = useTicketMessages(ticket.id);
  return (
    <div className="flex flex-col gap-4">
      <QueryState query={messages} loadingLabel="Cargando la conversación">
        {(data) =>
          data.data.length === 0 ? (
            <EmptyState
              icon={<MessagesSquare />}
              title="Sin mensajes todavía"
              description="El primer mensaje al cliente cuenta como la primera respuesta."
            />
          ) : (
            <ol className="flex flex-col gap-3" aria-label="Conversación del tiquete">
              {data.data.map((message) => (
                <MessageItem key={message.id} message={message} />
              ))}
            </ol>
          )
        }
      </QueryState>
      {ticket.can.write_public ? <Composer ticket={ticket} /> : null}
    </div>
  );
}
