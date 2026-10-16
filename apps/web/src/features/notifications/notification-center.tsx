'use client';

import type { Notification, NotificationListResponse } from '@arza/contracts';
import { Badge, Button, EmptyState } from '@arza/ui';
import Link from 'next/link';
import { useState, type JSX } from 'react';

import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { NTF_PATHS } from './labels';
import { useMarkAllRead, useMarkRead, useNotifications } from './queries';

function NoticeRow(props: {
  readonly notice: Notification;
  readonly onRead: (id: string) => void;
  readonly pending: boolean;
}): JSX.Element {
  const { notice } = props;
  const unread = notice.read_at === null;
  return (
    <li className="flex flex-col gap-1 rounded-lg border p-4 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {unread ? <Badge tone="info">Nuevo</Badge> : null}
          {notice.link === null ? (
            notice.title
          ) : (
            <Link className="text-primary underline" href={notice.link}>
              {notice.title}
            </Link>
          )}
        </p>
        <p className="text-sm break-words">{notice.body}</p>
        <p className="text-xs text-muted-foreground">{formatDateTime(notice.delivered_at)}</p>
      </div>
      {unread ? (
        <Button
          variant="outline"
          size="sm"
          disabled={props.pending}
          onClick={() => {
            props.onRead(notice.id);
          }}
        >
          Marcar como leído
        </Button>
      ) : null}
    </li>
  );
}

function NoticeList({
  data,
  unreadOnly,
}: {
  readonly data: NotificationListResponse;
  readonly unreadOnly: boolean;
}): JSX.Element {
  const markRead = useMarkRead();
  if (data.items.length === 0) {
    return (
      <EmptyState
        title={unreadOnly ? 'No tiene avisos sin leer' : 'Todavía no tiene avisos'}
        description="Aquí llegan las tareas que le asignan, las menciones en comentarios y las alertas. Fuera de la jornada, los avisos esperan al inicio de la siguiente."
      />
    );
  }
  return (
    <>
      {markRead.error === null ? null : <FormError error={markRead.error} />}
      <ul className="flex flex-col gap-3" aria-label="Avisos">
        {data.items.map((notice) => (
          <NoticeRow
            key={notice.id}
            notice={notice}
            onRead={markRead.execute}
            pending={markRead.pending}
          />
        ))}
      </ul>
      {markRead.dialog}
    </>
  );
}

function FilterButton(props: {
  readonly active: boolean;
  readonly label: string;
  readonly onClick: () => void;
}): JSX.Element {
  return (
    <Button
      variant={props.active ? 'primary' : 'outline'}
      size="sm"
      aria-pressed={props.active}
      onClick={props.onClick}
    >
      {props.label}
    </Button>
  );
}

function CenterActions(props: {
  readonly unread: number;
  readonly pending: boolean;
  readonly onReadAll: (args: null) => void;
}): JSX.Element {
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="ml-auto"
        disabled={props.unread === 0 || props.pending}
        onClick={() => {
          props.onReadAll(null);
        }}
      >
        Marcar todos como leídos
      </Button>
      <Button asChild variant="ghost" size="sm">
        <Link href={NTF_PATHS.preferences}>Preferencias</Link>
      </Button>
    </>
  );
}

/** Centro de avisos (ficha 17.5): los avisos de la persona, del más reciente al más antiguo. */
export function NotificationCenter(): JSX.Element {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const notices = useNotifications(unreadOnly, 100);
  const markAll = useMarkAllRead();
  const unread = notices.data?.unread_count ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterButton
          active={!unreadOnly}
          label="Todos"
          onClick={() => {
            setUnreadOnly(false);
          }}
        />
        <FilterButton
          active={unreadOnly}
          label={`Sin leer (${String(unread)})`}
          onClick={() => {
            setUnreadOnly(true);
          }}
        />
        <CenterActions unread={unread} pending={markAll.pending} onReadAll={markAll.execute} />
      </div>
      {markAll.error === null ? null : <FormError error={markAll.error} />}
      <QueryState query={notices} loadingLabel="Cargando sus avisos">
        {(data) => <NoticeList data={data} unreadOnly={unreadOnly} />}
      </QueryState>
      {markAll.dialog}
    </div>
  );
}
