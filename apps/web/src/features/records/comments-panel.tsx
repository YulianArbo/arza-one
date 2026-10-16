'use client';

import { MAX_MENTIONS, type Comment, type RecordRef } from '@arza/contracts';
import { Button, EmptyState } from '@arza/ui';
import { MessageSquare } from 'lucide-react';
import { useState, type JSX, type SubmitEvent } from 'react';

import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { TextInput } from '../organization/record-dialog';
import { CommentField } from '../workflows/workflow-actions';
import { personName } from '../workflows/labels';
import { useAddComment, useComments, useRemoveComment } from './queries';

/** «ana@x.co, luis@x.co» → los correos escritos, sin vacíos. */
export function emailsOf(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

function CommentItem(props: {
  readonly comment: Comment;
  readonly onRemove: (id: string) => void;
  readonly pending: boolean;
}): JSX.Element {
  const { comment } = props;
  return (
    <li className="flex flex-col gap-1 rounded-lg border p-3">
      <p className="text-sm font-medium">
        {personName(comment.author)}{' '}
        <span className="font-normal text-muted-foreground">
          · {formatDateTime(comment.created_at)}
        </span>
      </p>
      <p className="text-sm whitespace-pre-wrap break-words">{comment.body}</p>
      {comment.mentions.length === 0 ? null : (
        <p className="text-xs text-muted-foreground">
          Menciona a {comment.mentions.map(personName).join(', ')}
        </p>
      )}
      {comment.can_delete ? (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          disabled={props.pending}
          onClick={() => {
            props.onRemove(comment.id);
          }}
        >
          Retirar mi comentario
        </Button>
      ) : null}
    </li>
  );
}

function CommentForm({ record }: { readonly record: RecordRef }): JSX.Element {
  const [body, setBody] = useState('');
  const [mentions, setMentions] = useState('');
  const add = useAddComment(record, () => {
    setBody('');
    setMentions('');
  });
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    add.execute({ ...record, body, mention_emails: emailsOf(mentions) });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-label="Nuevo comentario">
      <CommentField
        id="comentario-nuevo"
        label="Comentario"
        hint="Los comentarios no se editan; usted puede retirar los suyos."
        value={body}
        onChange={setBody}
      />
      <TextInput
        id="comentario-menciones"
        label="Mencionar (opcional)"
        hint={`Correos de colaboradores de su empresa, separados por comas (hasta ${String(MAX_MENTIONS)}). Cada uno recibe un aviso.`}
        value={mentions}
        onValue={setMentions}
      />
      {add.error === null ? null : <FormError error={add.error} />}
      <SubmitButton
        label="Comentar"
        pendingLabel="Enviando…"
        pending={add.pending}
        done={body.trim() === ''}
        className="self-start"
      />
      {add.dialog}
    </form>
  );
}

/** Comentarios de un registro, con el formulario para comentar si la persona puede escribir. */
export function CommentsPanel(props: {
  readonly record: RecordRef;
  readonly canWrite: boolean;
}): JSX.Element {
  const comments = useComments(props.record);
  const remove = useRemoveComment(props.record);
  return (
    <section aria-labelledby="comentarios-titulo" className="flex flex-col gap-3">
      <h2 id="comentarios-titulo" className="text-lg font-semibold">
        Comentarios
      </h2>
      <QueryState query={comments} loadingLabel="Cargando los comentarios">
        {(data) =>
          data.items.length === 0 ? (
            <EmptyState
              icon={<MessageSquare />}
              title="Sin comentarios"
              description="Todavía nadie ha comentado este registro."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {data.items.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  onRemove={remove.execute}
                  pending={remove.pending}
                />
              ))}
            </ul>
          )
        }
      </QueryState>
      {remove.error === null ? null : <FormError error={remove.error} />}
      {remove.dialog}
      {props.canWrite ? <CommentForm record={props.record} /> : null}
    </section>
  );
}
