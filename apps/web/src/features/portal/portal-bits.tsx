import {
  ACCEPTANCE_STATUSES,
  CONTRACT_STATUSES,
  DELIVERABLE_STATUSES,
  ENVELOPE_STATUSES,
  MILESTONE_STATUSES,
  PORTAL_SIGNABLE_LABELS,
  PQRSF_STATUSES,
  PROJECT_STATUSES,
  TICKET_STATUSES,
  type PortalSignature,
} from '@arza/contracts';
import { Badge, Card, CardContent } from '@arza/ui';
import Link from 'next/link';
import type { JSX, ReactNode } from 'react';

import { formatDate } from '../../lib/format/date-time';

// Piezas comunes de las pantallas del portal del cliente (B30): estados con su tono, tarjetas que
// se abren y el avance. Diseñadas primero para celular (numeral 16.6).

export {
  ACCEPTANCE_STATUSES,
  CONTRACT_STATUSES,
  DELIVERABLE_STATUSES,
  ENVELOPE_STATUSES,
  MILESTONE_STATUSES,
  PORTAL_SIGNABLE_LABELS,
  PQRSF_STATUSES,
  PROJECT_STATUSES,
  TICKET_STATUSES,
};

type Tone = 'neutral' | 'success' | 'warning' | 'destructive' | 'info';

const TONES: Readonly<Record<string, Tone>> = {
  in_progress: 'info',
  at_risk: 'warning',
  paused: 'warning',
  closing: 'info',
  closed: 'neutral',
  pending: 'neutral',
  done: 'success',
  billable: 'success',
  delivered: 'info',
  accepted: 'success',
  returned: 'destructive',
  in_signature: 'warning',
  tacit: 'success',
  unanswered: 'warning',
  sent: 'warning',
  completed: 'success',
  rejected: 'destructive',
  expired: 'neutral',
  active: 'success',
  expiring: 'warning',
  terminated: 'neutral',
  new: 'info',
  assigned: 'info',
  waiting_customer: 'warning',
  resolved: 'success',
  filed: 'info',
  classified: 'info',
  responded: 'success',
};

/** El estado con su etiqueta y su tono. */
export function StatusBadge(props: {
  readonly status: string;
  readonly labels: Readonly<Record<string, string>>;
}): JSX.Element {
  return <Badge tone={TONES[props.status] ?? 'neutral'}>{props.labels[props.status] ?? '—'}</Badge>;
}

/** Tarjeta que se abre: toda la tarjeta es el enlace. */
export function OpenCard(props: {
  readonly href: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <Link href={props.href} className="block rounded-xl focus-visible:outline-2">
      <Card className="h-full hover-invert">
        <CardContent className="flex flex-col gap-2 p-4">{props.children}</CardContent>
      </Card>
    </Link>
  );
}

/** Barra de avance con su porcentaje en texto (no depende del color). */
export function Progress({
  percent,
  label,
}: {
  readonly percent: number;
  readonly label: string;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{percent} %</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-success" style={{ width: `${String(percent)}%` }} />
      </div>
    </div>
  );
}

/** Una línea de dato: etiqueta y valor. */
export function Fact(props: { readonly label: string; readonly children: ReactNode }): JSX.Element {
  return (
    <div className="flex flex-wrap justify-between gap-x-3 text-sm">
      <span className="text-muted-foreground">{props.label}</span>
      <span className="font-medium">{props.children}</span>
    </div>
  );
}

/** Cómo va la firma, en una frase. */
export function signatureLine(signature: PortalSignature): string {
  const progress = `${String(signature.signed)} de ${String(signature.signers)} firmas`;
  if (signature.status !== 'sent') return progress;
  return `${progress} · vence el ${formatDate(signature.expires_at.slice(0, 10))}`;
}

/** «Volver» a la lista de la sección. */
export function BackLink(props: { readonly href: string; readonly label: string }): JSX.Element {
  return (
    <Link href={props.href} className="text-sm text-primary underline-offset-4 hover:underline">
      ← {props.label}
    </Link>
  );
}
