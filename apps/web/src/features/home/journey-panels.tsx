'use client';

import type { TaskSummary } from '@arza/contracts';
import { AttentionList, buttonVariants, HighlightCard } from '@arza/ui';
import { ClipboardCheck } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { canSee, hrefFor, visibleNavigation } from '../../components/app-shell/navigation';
import { useRecentModules } from '../../components/app-shell/recent-modules';
import { formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { usePermissions } from '../session/permissions';
import { useSession } from '../session/session-provider';
import { WF_PATHS } from '../workflows/labels';
import { useMyTasks } from '../workflows/queries';

// Primera fila de «Su jornada» (B22B, boceto 05): lo que requiere atención y los módulos recientes.

const SHOWN = 5;

function attentionItems(tasks: readonly TaskSummary[]) {
  return tasks.slice(0, SHOWN).map((task) => ({
    id: task.id,
    title: task.title,
    meta: `${task.instance.workflow_name} · vence ${formatDateTime(task.due_at)}`,
    href: WF_PATHS.task(task.id),
    icon: <ClipboardCheck />,
  }));
}

/** Tareas abiertas de la persona, las primeras cinco, destacadas con el borde azul. */
export function AttentionPanel(): JSX.Element {
  return (
    <HighlightCard title="Requieren su atención">
      <QueryState query={useMyTasks('open')} loadingLabel="Cargando sus pendientes">
        {({ data }) =>
          data.length === 0 ? (
            <p className="text-muted-foreground">
              No tiene tareas pendientes. Cuando un trámite le asigne una, aparecerá aquí.
            </p>
          ) : (
            <AttentionList items={attentionItems(data)} linkAs={Link} />
          )
        }
      </QueryState>
    </HighlightCard>
  );
}

/** Últimos módulos abiertos; si aún no hay, los módulos de la persona. */
export function ContinuePanel(): JSX.Element {
  const { granted } = usePermissions();
  const userId = useSession().session.user.id;
  const recent = useRecentModules(userId, (item) => canSee(item, granted));
  const fallback = visibleNavigation(granted)
    .flatMap((group) => group.items)
    .filter((item) => item.slug !== '' && item.block === undefined)
    .slice(0, 4);
  const modules = recent.length > 0 ? recent : fallback;
  return (
    <HighlightCard
      title="Continuar trabajando"
      description={recent.length > 0 ? 'Sus últimos módulos abiertos.' : 'Sus módulos.'}
    >
      {modules.length === 0 ? (
        <p className="text-muted-foreground">Use el menú para ir a sus módulos.</p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {modules.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.slug}>
              <Link
                href={hrefFor(item)}
                className={buttonVariants({
                  variant: 'outline',
                  size: 'lg',
                  className: 'w-full justify-start',
                })}
              >
                <Icon aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </HighlightCard>
  );
}
