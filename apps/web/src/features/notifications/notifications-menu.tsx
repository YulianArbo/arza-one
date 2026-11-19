'use client';

import type { Notification } from '@arza/contracts';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@arza/ui';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { formatDateTime } from '../../lib/format/date-time';
import { NTF_PATHS, badgeCount, unreadLabel } from './labels';
import { useMarkRead, useNotifications } from './queries';

/** Avisos sin leer que muestra la campanita; los demás están en el centro de avisos. */
const MENU_LIMIT = 5;

function NoticeItem(props: {
  readonly notice: Notification;
  readonly onOpen: (id: string) => void;
}): JSX.Element {
  const { notice } = props;
  const text = (
    <span className="flex flex-col gap-0.5">
      <span className="font-medium">{notice.title}</span>
      <span className="text-xs text-muted-foreground">{formatDateTime(notice.delivered_at)}</span>
    </span>
  );
  return (
    <DropdownMenuItem
      asChild={notice.link !== null}
      onSelect={() => {
        props.onOpen(notice.id);
      }}
    >
      {notice.link === null ? text : <Link href={notice.link}>{text}</Link>}
    </DropdownMenuItem>
  );
}

/** Campanita de la zona 2 (numeral 16.3): cuántos avisos sin leer hay y los más recientes. */
export function NotificationsMenu(): JSX.Element {
  const unread = useNotifications(true, MENU_LIMIT);
  const markRead = useMarkRead();
  const count = unread.data?.unread_count ?? 0;
  const items = unread.data?.items ?? [];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label={unreadLabel(count)} className="relative">
          <Bell aria-hidden="true" />
          {count === 0 ? null : (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-action px-1 text-[10px] leading-4 font-semibold text-action-foreground"
            >
              {badgeCount(count)}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Avisos</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <DropdownMenuItem disabled>No tiene avisos nuevos.</DropdownMenuItem>
        ) : (
          items.map((notice) => (
            <NoticeItem key={notice.id} notice={notice} onOpen={markRead.execute} />
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={NTF_PATHS.center}>Ver todos los avisos</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
