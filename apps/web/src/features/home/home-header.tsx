'use client';

import { buttonVariants, PageHeader } from '@arza/ui';
import { ListTodo, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { useHydrated } from '../../lib/hydration/use-hydrated';
import { personalMessage } from '../../lib/messages/daily-message';
import { greetingLine } from '../../lib/messages/greeting';
import { bogotaToday } from '../crm/labels';
import { usePermissions } from '../session/permissions';
import { useSession } from '../session/session-provider';
import { WF_PATHS } from '../workflows/labels';

/** Saludo y mensaje del día: dependen de la hora del navegador, así que llegan al hidratar. */
function DayLine(): JSX.Element | null {
  const { user } = useSession().session;
  const hydrated = useHydrated();
  if (!hydrated) return null;
  const now = new Date();
  return (
    <p className="inline-flex max-w-full items-start gap-2 self-start rounded-2xl bg-muted px-3 py-1.5 text-foreground">
      <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>
        <span className="sr-only">Mensaje del día: </span>
        {personalMessage(user.id, bogotaToday(now))}
      </span>
    </p>
  );
}

function Greeting(): JSX.Element | null {
  const { user } = useSession().session;
  const hydrated = useHydrated();
  return hydrated ? <span>{greetingLine(new Date(), user.display_name)}</span> : null;
}

/** Encabezado de Inicio (B22B, boceto 05): «Su jornada», el saludo y el mensaje del día. */
export function HomeHeader(): JSX.Element {
  const canWork = usePermissions().can('wf.task.work');
  return (
    <PageHeader
      title="Su jornada"
      description="Revise lo que necesita atención y retome el trabajo desde su módulo."
      eyebrow={<Greeting />}
      action={
        canWork ? (
          <Link href={WF_PATHS.inbox} className={buttonVariants({ variant: 'outline' })}>
            <ListTodo aria-hidden="true" />
            Ver mis tareas
          </Link>
        ) : null
      }
    >
      <DayLine />
    </PageHeader>
  );
}
