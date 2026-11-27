'use client';

import type { Indicator, StrategicObjective } from '@arza/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@arza/ui';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { useHrAction } from '../hr/hr-queries';
import { DIRECTION_REFRESH } from './direction-queries';

// Asignar los indicadores que miden un objetivo estratégico (B46, decisión 4). Cada indicador mide
// a lo sumo un objetivo: al marcarlo aquí deja el objetivo anterior.

interface LinkProps {
  readonly objective: StrategicObjective;
  readonly indicators: readonly Indicator[];
}

function IndicatorChoices(props: {
  readonly indicators: readonly Indicator[];
  readonly chosen: ReadonlySet<string>;
  readonly toggle: (id: string) => void;
}): JSX.Element {
  if (props.indicators.length === 0) {
    return <p className="text-sm text-muted-foreground">Calidad aún no tiene indicadores.</p>;
  }
  return (
    <fieldset className="flex max-h-80 flex-col gap-2 overflow-y-auto">
      <legend className="sr-only">Indicadores</legend>
      {props.indicators.map((item) => (
        <label key={item.id} className="flex min-h-6 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={props.chosen.has(item.id)}
            onChange={() => {
              props.toggle(item.id);
            }}
          />
          <span>
            <strong>{item.code}</strong> · {item.name} ({item.process.name})
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function useIndicatorChoice(objective: StrategicObjective) {
  const api = useApiClient();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set(objective.indicator_ids));
  const action = useHrAction<readonly string[]>(
    (ids, csrfToken) =>
      api.put(`/v1/qms/strategic-objectives/${objective.id}/indicators`, {
        body: { indicator_ids: ids },
        csrfToken,
      }),
    () => {
      setOpen(false);
    },
    DIRECTION_REFRESH,
  );
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChosen(next);
  };
  const openChange = (value: boolean) => {
    setChosen(new Set(objective.indicator_ids));
    setOpen(value);
  };
  return { open, openChange, chosen, toggle, action };
}

export function LinkIndicatorsCell({ objective, indicators }: LinkProps): JSX.Element {
  const { open, openChange, chosen, toggle, action } = useIndicatorChoice(objective);
  return (
    <Dialog open={open} onOpenChange={openChange}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          openChange(true);
        }}
      >
        Indicadores
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Indicadores de {objective.code}</DialogTitle>
          <DialogDescription>Marque los indicadores que miden este objetivo.</DialogDescription>
        </DialogHeader>
        <IndicatorChoices indicators={indicators} chosen={chosen} toggle={toggle} />
        {action.error === null ? null : <FormError error={action.error} />}
        <DialogFooter>
          <Button
            type="button"
            disabled={action.pending}
            onClick={() => {
              action.execute([...chosen]);
            }}
          >
            {action.pending ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
        {action.dialog}
      </DialogContent>
    </Dialog>
  );
}
