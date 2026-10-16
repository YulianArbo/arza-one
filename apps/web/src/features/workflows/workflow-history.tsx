import type { HistoryEntry } from '@arza/contracts';
import { Badge } from '@arza/ui';
import type { JSX } from 'react';

import { formatDateTime } from '../../lib/format/date-time';
import { personName } from './labels';

// Componente «Historial del flujo» (B15, ficha 17.5): actor, fecha, decisión y comentario de cada
// paso. Lo usan las tareas, los trámites y, después, la ficha de cada registro con flujo.

function decisionTone(entry: HistoryEntry): 'success' | 'destructive' | 'neutral' {
  if (entry.action === 'approve') return 'success';
  if (entry.action === 'reject') return 'destructive';
  return 'neutral';
}

function Movement({ entry }: { readonly entry: HistoryEntry }): JSX.Element {
  if (entry.from_state === null) return <span>Empezó en «{entry.to_state.label}»</span>;
  if (entry.from_state.key === entry.to_state.key) {
    return <span>En «{entry.to_state.label}»</span>;
  }
  return (
    <span>
      De «{entry.from_state.label}» a «{entry.to_state.label}»
    </span>
  );
}

function HistoryItem({ entry }: { readonly entry: HistoryEntry }): JSX.Element {
  return (
    <li className="flex flex-col gap-1 border-l-2 border-border pb-4 pl-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={decisionTone(entry)}>{entry.action_label}</Badge>
        <span className="text-sm text-muted-foreground">
          <Movement entry={entry} />
        </span>
      </div>
      <p className="text-sm">
        <span className="font-medium">
          {entry.actor === null ? 'El sistema' : personName(entry.actor)}
        </span>
        {entry.on_behalf_of === null ? null : (
          <span> a nombre de {personName(entry.on_behalf_of)}</span>
        )}
        <span className="text-muted-foreground"> · {formatDateTime(entry.occurred_at)}</span>
      </p>
      {entry.comment === null ? null : (
        <blockquote className="text-sm text-muted-foreground">«{entry.comment}»</blockquote>
      )}
    </li>
  );
}

/** Historial del trámite, del paso más antiguo al más reciente. */
export function WorkflowHistory({
  history,
}: {
  readonly history: readonly HistoryEntry[];
}): JSX.Element {
  return (
    <section aria-labelledby="historial-titulo" className="flex flex-col gap-3">
      <h2 id="historial-titulo" className="text-lg font-semibold">
        Historial del flujo
      </h2>
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay pasos registrados.</p>
      ) : (
        <ol className="flex flex-col">
          {history.map((entry) => (
            <HistoryItem key={entry.id} entry={entry} />
          ))}
        </ol>
      )}
    </section>
  );
}
