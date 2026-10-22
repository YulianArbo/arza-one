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
import { useCallback, type DragEvent, type JSX, type RefCallback } from 'react';

import { formatDate } from '../../lib/format/date-time';
import { CRM_PATHS, OPPORTUNITY_STAGES, formatPesos } from './labels';

// Tarjeta de una oportunidad en el tablero del embudo (B22). Se arrastra a otra columna con el
// ratón o se mueve con «Mover a…», que también funciona con el teclado (numeral 16.6).

const DRAG_TYPE = 'application/x-arza-opportunity';

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
        <Button variant="ghost" size="sm" aria-label={`Mover ${opportunity.code} a otra etapa`}>
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
  const onDragStart = (event: DragEvent<HTMLElement>): void => {
    event.dataTransfer.setData(DRAG_TYPE, opportunity.id);
    event.dataTransfer.effectAllowed = 'move';
  };
  return (
    <li className="flex flex-col gap-1 rounded-md border bg-card p-3 text-sm">
      <Link
        href={CRM_PATHS.opportunity(opportunity.id)}
        draggable={props.canMove}
        onDragStart={onDragStart}
        className="font-medium text-primary underline-offset-4 hover:underline"
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

/**
 * Zona donde se suelta una tarjeta arrastrada con el ratón: avisa qué oportunidad llegó. Es solo
 * un atajo; con el teclado se usa «Mover a…» en la misma tarjeta.
 */
export function useDropZone(
  enabled: boolean,
  onDrop: (id: string) => void,
): RefCallback<HTMLElement> {
  return useCallback(
    (element: HTMLElement | null) => {
      if (element === null || !enabled) return undefined;
      const allow = (event: globalThis.DragEvent): void => {
        if (event.dataTransfer?.types.includes(DRAG_TYPE) === true) event.preventDefault();
      };
      const drop = (event: globalThis.DragEvent): void => {
        const id = event.dataTransfer?.getData(DRAG_TYPE) ?? '';
        if (id === '') return;
        event.preventDefault();
        onDrop(id);
      };
      element.addEventListener('dragover', allow);
      element.addEventListener('drop', drop);
      return () => {
        element.removeEventListener('dragover', allow);
        element.removeEventListener('drop', drop);
      };
    },
    [enabled, onDrop],
  );
}
