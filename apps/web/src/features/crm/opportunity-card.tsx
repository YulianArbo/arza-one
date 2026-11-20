'use client';

import { OPEN_STAGES, type OpenStage, type OpportunitySummary } from '@arza/contracts';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@arza/ui';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { startDrag } from '../../components/drop-zone';
import { formatDate } from '../../lib/format/date-time';
import { CRM_PATHS, OPPORTUNITY_STAGES, formatPesos } from './labels';

// Tarjeta de una oportunidad en el tablero del embudo (B22). Se arrastra a otra columna con el
// ratón o se mueve con «Mover a…», que también funciona con el teclado (numeral 16.6).

export const OPPORTUNITY_DRAG = 'application/x-arza-opportunity';

interface OpportunityCardProps {
  readonly opportunity: OpportunitySummary;
  readonly canMove: boolean;
  readonly overdue: boolean;
  readonly onMove: (opportunity: OpportunitySummary, stage: OpenStage) => void;
}

function MoveMenu(props: OpportunityCardProps): JSX.Element {
  const { opportunity } = props;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Mover a otra etapa: ${opportunity.code}`}>
          Mover a
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Etapa nueva</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPEN_STAGES.filter((stage) => stage !== opportunity.stage).map((stage) => (
          <DropdownMenuItem
            key={stage}
            onSelect={() => {
              props.onMove(opportunity, stage);
            }}
          >
            {OPPORTUNITY_STAGES[stage]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function OpportunityCard(props: OpportunityCardProps): JSX.Element {
  const { opportunity } = props;
  return (
    <li className="flex flex-col gap-1.5 rounded-xl border bg-card p-4 text-sm">
      <Link
        href={CRM_PATHS.opportunity(opportunity.id)}
        draggable={props.canMove}
        onDragStart={startDrag(OPPORTUNITY_DRAG, opportunity.id)}
        className="font-semibold text-foreground underline-offset-4 hover:underline"
      >
        {opportunity.title}
      </Link>
      <p className="text-xs text-muted-foreground">
        {opportunity.code} · {opportunity.party.name}
      </p>
      <p className="tabular-nums">
        {formatPesos(opportunity.estimated_value)} · {String(opportunity.probability)} %
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          Cierre {formatDate(opportunity.expected_close)}{' '}
          {props.overdue ? <Badge tone="warning">Vencida</Badge> : null}
        </span>
        {props.canMove ? <MoveMenu {...props} /> : null}
      </div>
    </li>
  );
}
