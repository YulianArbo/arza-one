'use client';

import {
  pqrsfTypeSchema,
  pqrsfViewSchema,
  type PqrsfSummary,
  type PqrsfView,
} from '@arza/contracts';
import {
  Badge,
  Button,
  EmptyState,
  FormField,
  Pager,
  SelectField,
  SimpleTable,
  TableCell,
  TableRow,
  buttonVariants,
  useCursorTrail,
} from '@arza/ui';
import { MessagesSquare } from 'lucide-react';
import Link from 'next/link';
import { useState, type JSX, type SubmitEvent } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { optionsOf } from '../crm/labels';
import { usePermissions } from '../session/permissions';
import { usePqrsfList } from './care-queries';
import {
  PQRSF_APPROVALS,
  PQRSF_DUE_STATES,
  PQRSF_DUE_TONES,
  PQRSF_STATUSES,
  PQRSF_STATUS_TONES,
  PQRSF_TYPES,
  PQRSF_VIEWS,
  SERVICE_PATHS,
} from './labels';
import { ServiceNav } from './service-nav';

// Bandeja de PQRSF (B29, numeral 16.4, patrón de listado): por vista (abiertas, mías, por
// clasificar, por aprobar, por vencer, vencidas), la que vence primero arriba, con su plazo.

const VIEW_OPTIONS = pqrsfViewSchema.options.map((view) => ({
  value: view,
  label: PQRSF_VIEWS[view],
}));
const TYPE_OPTIONS = optionsOf(pqrsfTypeSchema.options, PQRSF_TYPES, 'Todos');

interface Filters {
  readonly view: PqrsfView;
  readonly q: string;
  readonly type: string;
}

const START: Filters = { view: 'open', q: '', type: '' };

function StatusCell({ pqrsf }: { readonly pqrsf: PqrsfSummary }): JSX.Element {
  return (
    <TableCell>
      <Badge tone={PQRSF_STATUS_TONES[pqrsf.status]}>{PQRSF_STATUSES[pqrsf.status]}</Badge>
      {pqrsf.approval === 'none' ? null : (
        <p className="text-xs">{PQRSF_APPROVALS[pqrsf.approval]}</p>
      )}
    </TableCell>
  );
}

function PqrsfRow({ pqrsf }: { readonly pqrsf: PqrsfSummary }): JSX.Element {
  return (
    <TableRow>
      <TableCell>
        <Link
          href={SERVICE_PATHS.pqrsf(pqrsf.id)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {pqrsf.code}
        </Link>
        <p className="text-xs text-muted-foreground">{pqrsf.subject}</p>
      </TableCell>
      <TableCell>
        {PQRSF_TYPES[pqrsf.type]}
        {pqrsf.privacy_kind === null ? null : <p className="text-xs">Datos personales</p>}
      </TableCell>
      <TableCell>{pqrsf.requester_name}</TableCell>
      <TableCell>{pqrsf.assignee?.name ?? 'Sin asignar'}</TableCell>
      <TableCell>{formatDate(pqrsf.due_on)}</TableCell>
      <TableCell>
        <Badge tone={PQRSF_DUE_TONES[pqrsf.due_state]}>{PQRSF_DUE_STATES[pqrsf.due_state]}</Badge>
      </TableCell>
      <StatusCell pqrsf={pqrsf} />
    </TableRow>
  );
}

function FilterFields(props: {
  readonly values: Filters;
  readonly onChange: (values: Filters) => void;
}): JSX.Element {
  const { values, onChange } = props;
  return (
    <>
      <SelectField
        id="pqrsf-vista"
        label="Vista"
        options={VIEW_OPTIONS}
        value={values.view}
        onChange={(event) => {
          onChange({ ...values, view: pqrsfViewSchema.parse(event.target.value) });
        }}
      />
      <FormField
        id="pqrsf-buscar"
        label="Buscar por radicado, asunto o nombre"
        value={values.q}
        onChange={(event) => {
          onChange({ ...values, q: event.target.value });
        }}
      />
      <SelectField
        id="pqrsf-tipo"
        label="Tipo"
        options={TYPE_OPTIONS}
        value={values.type}
        onChange={(event) => {
          onChange({ ...values, type: event.target.value });
        }}
      />
    </>
  );
}

function SearchForm({ onApply }: { readonly onApply: (filters: Filters) => void }): JSX.Element {
  const [values, setValues] = useState(START);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onApply(values);
  };
  return (
    <form
      onSubmit={submit}
      role="search"
      className="grid gap-3 sm:grid-cols-[12rem_1fr_10rem_auto] sm:items-end"
    >
      <FilterFields values={values} onChange={setValues} />
      <Button type="submit" variant="outline">
        Ver
      </Button>
    </form>
  );
}

const HEADERS = ['Radicado', 'Tipo', 'Presentada por', 'Responsable', 'Vence', 'Plazo', 'Estado'];

function Results({ filters }: { readonly filters: Filters }): JSX.Element {
  const trail = useCursorTrail();
  const page = usePqrsfList({ ...filters, cursor: trail.cursor, limit: '25' });
  return (
    <QueryState query={page} loadingLabel="Cargando las PQRSF">
      {(data) =>
        data.data.length === 0 ? (
          <EmptyState
            icon={<MessagesSquare />}
            title="No hay PQRSF en esta vista"
            description="Las que se radican en el sitio público llegan aquí con su radicado."
          />
        ) : (
          <>
            <SimpleTable
              caption={`PQRSF: ${PQRSF_VIEWS[filters.view]}`}
              scrollLabel="PQRSF; desplácese a los lados para ver todas las columnas"
              headers={HEADERS}
            >
              {data.data.map((pqrsf) => (
                <PqrsfRow key={pqrsf.id} pqrsf={pqrsf} />
              ))}
            </SimpleTable>
            <Pager page={data} {...trail.pager} />
          </>
        )
      }
    </QueryState>
  );
}

export function PqrsfInbox(): JSX.Element {
  const { can } = usePermissions();
  const [filters, setFilters] = useState(START);
  return (
    <div className="flex flex-col gap-4">
      <ServiceNav current="pqrsf" />
      <PageHeader
        title="PQRSF"
        description="Peticiones, quejas, reclamos, sugerencias y felicitaciones, con su plazo de respuesta en días hábiles."
        action={
          can('service.pqrsf.classify') ? (
            <Link href={SERVICE_PATHS.pqrsfCreate} className={buttonVariants()}>
              Registrar una PQRSF
            </Link>
          ) : undefined
        }
      />
      <SearchForm onApply={setFilters} />
      <Results key={`${filters.view}|${filters.q}|${filters.type}`} filters={filters} />
    </div>
  );
}
