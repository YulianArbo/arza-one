'use client';

import {
  ticketPrioritySchema,
  ticketViewSchema,
  type TicketSummary,
  type TicketView,
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
import { Headset } from 'lucide-react';
import Link from 'next/link';
import { useState, type JSX, type SubmitEvent } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { optionsOf } from '../crm/labels';
import { usePermissions } from '../session/permissions';
import {
  CLOCK_STATES,
  CLOCK_TONES,
  PRIORITY_TONES,
  SERVICE_PATHS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_STATUS_TONES,
  TICKET_VIEWS,
} from './labels';
import { useTickets } from './queries';
import { ServiceNav } from './service-nav';
import { ServiceOverview } from './service-overview';

// Bandeja de tiquetes (B28, numeral 16.4, patrón de listado): por vista (míos, sin asignar, por
// vencer, vencidos, en espera), lo que vence primero arriba, con el reloj de cada uno. Quien solo
// ve lo propio ve sus solicitudes.

const VIEW_OPTIONS = ticketViewSchema.options.map((view) => ({
  value: view,
  label: TICKET_VIEWS[view],
}));
const PRIORITY_OPTIONS = optionsOf(ticketPrioritySchema.options, TICKET_PRIORITIES, 'Todas');

interface Filters {
  readonly view: TicketView;
  readonly q: string;
  readonly priority: string;
}

const START: Filters = { view: 'all', q: '', priority: '' };

function TicketRow({ ticket }: { readonly ticket: TicketSummary }): JSX.Element {
  return (
    <TableRow>
      <TableCell>
        <Link
          href={SERVICE_PATHS.ticket(ticket.id)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {ticket.code}
        </Link>
        <p className="text-xs text-muted-foreground">{ticket.subject}</p>
      </TableCell>
      <TableCell>{ticket.party?.name ?? ticket.requester?.name ?? 'Interno'}</TableCell>
      <TableCell>
        <Badge tone={PRIORITY_TONES[ticket.priority]}>{TICKET_PRIORITIES[ticket.priority]}</Badge>
      </TableCell>
      <TableCell>{ticket.assignee?.name ?? 'Sin asignar'}</TableCell>
      <TableCell>
        {ticket.resolution_due_at === null ? '—' : formatDateTime(ticket.resolution_due_at)}
      </TableCell>
      <TableCell>
        <Badge tone={CLOCK_TONES[ticket.clock]}>{CLOCK_STATES[ticket.clock]}</Badge>
        {ticket.in_warranty ? <p className="text-xs">En garantía</p> : null}
      </TableCell>
      <TableCell>
        <Badge tone={TICKET_STATUS_TONES[ticket.status]}>{TICKET_STATUSES[ticket.status]}</Badge>
      </TableCell>
    </TableRow>
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

function FilterFields(props: {
  readonly values: Filters;
  readonly onChange: (values: Filters) => void;
}): JSX.Element {
  const { values } = props;
  const setValues = props.onChange;
  return (
    <>
      <SelectField
        id="tiquetes-vista"
        label="Vista"
        options={VIEW_OPTIONS}
        value={values.view}
        onChange={(event) => {
          setValues({ ...values, view: ticketViewSchema.parse(event.target.value) });
        }}
      />
      <FormField
        id="tiquetes-buscar"
        label="Buscar por código o asunto"
        value={values.q}
        onChange={(event) => {
          setValues({ ...values, q: event.target.value });
        }}
      />
      <SelectField
        id="tiquetes-prioridad"
        label="Prioridad"
        options={PRIORITY_OPTIONS}
        value={values.priority}
        onChange={(event) => {
          setValues({ ...values, priority: event.target.value });
        }}
      />
    </>
  );
}

function Results({ filters }: { readonly filters: Filters }): JSX.Element {
  const trail = useCursorTrail();
  const page = useTickets({ ...filters, cursor: trail.cursor, limit: '25' });
  return (
    <QueryState query={page} loadingLabel="Cargando los tiquetes">
      {(data) =>
        data.data.length === 0 ? (
          <EmptyState
            icon={<Headset />}
            title="No hay tiquetes en esta vista"
            description="Cambie la vista o la búsqueda. Los tiquetes nuevos aparecen aquí."
          />
        ) : (
          <>
            <SimpleTable
              caption={`Tiquetes: ${TICKET_VIEWS[filters.view]}`}
              scrollLabel="Tiquetes; desplácese a los lados para ver todas las columnas"
              headers={[
                'Tiquete',
                'Cliente',
                'Prioridad',
                'Responsable',
                'Vence',
                'Reloj',
                'Estado',
              ]}
            >
              {data.data.map((ticket) => (
                <TicketRow key={ticket.id} ticket={ticket} />
              ))}
            </SimpleTable>
            <Pager page={data} {...trail.pager} />
          </>
        )
      }
    </QueryState>
  );
}

export function TicketInbox(): JSX.Element {
  const { can } = usePermissions();
  const [filters, setFilters] = useState(START);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Mesa de ayuda"
        description="Tiquetes de soporte con su acuerdo de tiempo: el reloj se pausa mientras se espera al cliente."
        action={
          can('service.ticket.create') ? (
            <Link href={SERVICE_PATHS.create} className={buttonVariants()}>
              Nuevo tiquete
            </Link>
          ) : null
        }
      />
      <ServiceNav current="tickets" />
      {can('service.ticket.read') ? <ServiceOverview /> : null}
      <h2 className="font-heading text-card-title font-semibold">Todos los tiquetes</h2>
      <SearchForm onApply={setFilters} />
      <Results key={`${filters.view}|${filters.q}|${filters.priority}`} filters={filters} />
    </div>
  );
}
