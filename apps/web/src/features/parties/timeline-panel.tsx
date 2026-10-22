'use client';

import type { TimelineEntry } from '@arza/contracts';
import { EmptyState, Pager, useCursorTrail } from '@arza/ui';
import { History } from 'lucide-react';
import type { JSX } from 'react';

import { formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { actionLabel, entityLabel } from '../audit/labels';
import { useTimeline } from './queries';

// Línea de tiempo del tercero (ficha 17.3): todo lo ocurrido con él en cualquier módulo, solo lo
// que el rol puede ver. La API filtra; la pantalla solo muestra.

function Entry({ entry }: { readonly entry: TimelineEntry }): JSX.Element {
  return (
    <li className="flex flex-col gap-0.5 border-l-2 border-border pl-3">
      <span className="text-sm font-medium">{actionLabel(entry.action)}</span>
      <span className="text-xs text-muted-foreground">
        {formatDateTime(entry.occurred_at)} · {entry.actor_name ?? 'El sistema'} ·{' '}
        {entityLabel(entry.entity_type)}
      </span>
    </li>
  );
}

export function TimelinePanel({ partyId }: { readonly partyId: string }): JSX.Element {
  const trail = useCursorTrail();
  const timeline = useTimeline(partyId, trail.cursor);
  return (
    <QueryState query={timeline} loadingLabel="Cargando la línea de tiempo">
      {(page) =>
        page.data.length === 0 ? (
          <EmptyState
            icon={<History />}
            title="Todavía no hay movimientos"
            description="Aquí aparecerá todo lo que ocurra con este tercero, lo más reciente primero."
          />
        ) : (
          <div className="flex flex-col gap-3">
            <ol className="flex flex-col gap-3" aria-label="Línea de tiempo">
              {page.data.map((entry) => (
                <Entry key={entry.id} entry={entry} />
              ))}
            </ol>
            <Pager page={page} {...trail.pager} />
          </div>
        )
      }
    </QueryState>
  );
}
