'use client';

import { Button, FormField, Pager, SelectField, useCursorTrail } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { startOfBogotaDay } from '../administration/labels';
import { QueryState } from '../administration/query-state';
import { AuditEventTable } from './audit-event-table';
import { AuditExportButton } from './audit-export-button';
import { RESULT_LABELS } from './labels';
import { useAuditEvents, type AuditFilters } from './queries';

const DAY_MS = 24 * 60 * 60 * 1000;

const RESULT_OPTIONS = [
  { value: '', label: 'Todos' },
  ...Object.entries(RESULT_LABELS).map(([value, label]) => ({ value, label })),
];

interface FormValues {
  readonly since: string;
  readonly until: string;
  readonly action: string;
  readonly result: string;
}

const EMPTY: FormValues = { since: '', until: '', action: '', result: '' };

/** Del formulario a los filtros de la API: «hasta» incluye todo ese día en hora de Colombia. */
function filtersOf(values: FormValues): AuditFilters {
  const until = values.until === '' ? '' : startOfBogotaDay(values.until);
  return {
    from: values.since === '' ? '' : startOfBogotaDay(values.since),
    to: until === '' ? '' : new Date(new Date(until).getTime() + DAY_MS).toISOString(),
    action: values.action.trim().toLowerCase(),
    result: values.result,
  };
}

function Filters({ onApply }: { readonly onApply: (filters: AuditFilters) => void }): JSX.Element {
  const [values, setValues] = useState<FormValues>(EMPTY);
  const field = (name: keyof FormValues) => ({
    value: values[name],
    onChange: (event: { target: { value: string } }) => {
      setValues({ ...values, [name]: event.target.value });
    },
  });
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onApply(filtersOf(values));
  };
  return (
    <form
      onSubmit={submit}
      role="search"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[10rem_10rem_1fr_10rem_auto] lg:items-end"
    >
      <FormField id="auditoria-desde" label="Desde" type="date" {...field('since')} />
      <FormField id="auditoria-hasta" label="Hasta" type="date" {...field('until')} />
      <FormField
        id="auditoria-accion"
        label="Acción"
        hint="Por ejemplo iam.role o iam.user.lock"
        {...field('action')}
      />
      <SelectField
        id="auditoria-resultado"
        label="Resultado"
        options={RESULT_OPTIONS}
        {...field('result')}
      />
      <Button type="submit" variant="outline">
        Buscar
      </Button>
    </form>
  );
}

/** Consulta de eventos de la auditoría, por páginas (audit.event.read). */
export function AuditEvents(): JSX.Element {
  const [filters, setFilters] = useState<AuditFilters>({});
  const trail = useCursorTrail();
  const page = useAuditEvents(filters, trail.cursor);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Filters
          onApply={(next) => {
            setFilters(next);
            trail.reset();
          }}
        />
        <AuditExportButton filters={filters} />
      </div>
      <QueryState query={page} loadingLabel="Cargando la auditoría">
        {(data) => (
          <>
            <AuditEventTable
              events={data.data}
              caption="Eventos de la auditoría, lo más reciente primero"
              emptyTitle="No hay eventos con esos filtros"
              emptyDescription="Cambie las fechas, la acción o el resultado para ver otros eventos."
            />
            <Pager page={data} {...trail.pager} />
          </>
        )}
      </QueryState>
    </div>
  );
}
