'use client';

import { ITEM_STATUS_ORDER, canMoveItem, type ItemStatus, type ProjectItem } from '@arza/contracts';
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
import type { JSX } from 'react';

import { useDragSource } from '../../components/drop-zone';
import {
  ITEM_PRIORITIES,
  ITEM_STATUSES,
  ITEM_TYPES,
  ITEM_TYPE_TONES,
  PRIORITY_TONES,
  itemLabel,
} from './labels';

// Tarjeta de un ítem en el tablero (B26). Se arrastra a otra columna con el ratón o se mueve con
// «Mover a…», que también funciona con el teclado (numeral 16.6). Solo ofrece los pasos posibles:
// avanzar una columna o volver a una anterior.

export const ITEM_DRAG = 'application/x-arza-project-item';

interface ItemCardProps {
  readonly item: ProjectItem;
  readonly canMove: boolean;
  readonly onMove: (item: ProjectItem, status: ItemStatus) => void;
}

function MoveMenu(props: ItemCardProps): JSX.Element {
  const { item } = props;
  const targets = ITEM_STATUS_ORDER.filter((status) => canMoveItem(item.status, status));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Mover ${itemLabel(item)} a otra columna`}>
          Mover a
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Columna nueva</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {targets.map((status) => (
          <DropdownMenuItem
            key={status}
            onSelect={() => {
              props.onMove(item, status);
            }}
          >
            {ITEM_STATUSES[status]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ItemCard(props: ItemCardProps): JSX.Element {
  const { item } = props;
  const drag = useDragSource(ITEM_DRAG, item.id, props.canMove);
  return (
    <li ref={drag} className="flex flex-col gap-1 rounded-md border bg-card p-3 text-sm">
      <span className="font-medium">{itemLabel(item)}</span>
      <div className="flex flex-wrap gap-1">
        <Badge tone={ITEM_TYPE_TONES[item.type]}>{ITEM_TYPES[item.type]}</Badge>
        <Badge tone={PRIORITY_TONES[item.priority]}>{ITEM_PRIORITIES[item.priority]}</Badge>
      </div>
      {item.parent === null ? null : (
        <p className="text-xs text-muted-foreground">En {itemLabel(item.parent)}</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {item.assignee?.name ?? 'Sin asignar'}
        </span>
        {props.canMove ? <MoveMenu {...props} /> : null}
      </div>
    </li>
  );
}
