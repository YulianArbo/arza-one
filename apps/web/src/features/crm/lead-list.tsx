'use client';

import { leadStatusSchema, type LeadSummary } from '@arza/contracts';
import {
  Badge,
  Button,
  buttonVariants,
  EmptyState,
  FormField,
  Pager,
  SelectField,
  SimpleTable,
  TableCell,
  TableRow,
  useCursorTrail,
} from '@arza/ui';
import { UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useState, type JSX, type SubmitEvent } from 'react';

import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { usePermissions } from '../session/permissions';
import { CRM_PATHS, LEAD_STATUSES, LEAD_STATUS_TONES, bogotaToday, optionsOf } from './labels';
import { useLeads } from './queries';

// Prospectos (B22, ficha 17.6; numeral 16.4, patrón de listado): los más recientes primero, con
// búsqueda por código, nombre o empresa y filtro por estado.

const STATUS_OPTIONS = optionsOf(leadStatusSchema.options, LEAD_STATUSES, 'Todos');

interface LeadFilters {
  readonly q: string;
  readonly status: string;
}

const NO_FILTERS: LeadFilters = { q: '', status: '' };

function LeadRow({ lead }: { readonly lead: LeadSummary }): JSX.Element {
  return (
    <TableRow>
      <TableCell>
        <Link
          href={CRM_PATHS.lead(lead.id)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {lead.person.name}
        </Link>
        <p className="text-xs text-muted-foreground">
          {lead.code}
          {lead.company_name === null ? '' : ` · ${lead.company_name}`}
        </p>
      </TableCell>
      <TableCell>{lead.email ?? lead.phone ?? '—'}</TableCell>
      <TableCell>{lead.source.label}</TableCell>
      <TableCell>{lead.owner?.name ?? '—'}</TableCell>
      <TableCell>{formatDate(bogotaToday(new Date(lead.created_at)))}</TableCell>
      <TableCell>
        <Badge tone={LEAD_STATUS_TONES[lead.status]}>{LEAD_STATUSES[lead.status]}</Badge>
      </TableCell>
    </TableRow>
  );
}

function Filters({ onApply }: { readonly onApply: (filters: LeadFilters) => void }): JSX.Element {
  const [values, setValues] = useState(NO_FILTERS);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onApply(values);
  };
  return (
    <form
      onSubmit={submit}
      role="search"
      className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end"
    >
      <FormField
        id="buscar-prospecto"
        label="Buscar por código, nombre o empresa"
        value={values.q}
        onChange={(event) => {
          setValues({ ...values, q: event.target.value });
        }}
      />
      <SelectField
        id="estado-prospecto"
        label="Estado"
        options={STATUS_OPTIONS}
        value={values.status}
        onChange={(event) => {
          setValues({ ...values, status: event.target.value });
        }}
      />
      <Button type="submit" variant="outline">
        Buscar
      </Button>
    </form>
  );
}

function LeadTable(props: {
  readonly leads: readonly LeadSummary[];
  readonly filtered: boolean;
  readonly canCreate: boolean;
}): JSX.Element {
  if (props.leads.length === 0) {
    return (
      <EmptyState
        icon={<UserPlus />}
        title={props.filtered ? 'No hay prospectos con esos filtros' : 'Todavía no hay prospectos'}
        description={
          props.filtered
            ? 'Cambie la búsqueda o el estado.'
            : 'Registre a las personas interesadas en los servicios de la empresa.'
        }
        action={
          props.canCreate && !props.filtered ? (
            <Link href={CRM_PATHS.newLead} className={buttonVariants()}>
              Registrar prospecto
            </Link>
          ) : undefined
        }
      />
    );
  }
  return (
    <SimpleTable headers={['Prospecto', 'Contacto', 'Origen', 'Responsable', 'Fecha', 'Estado']}>
      {props.leads.map((lead) => (
        <LeadRow key={lead.id} lead={lead} />
      ))}
    </SimpleTable>
  );
}

export function LeadList(): JSX.Element {
  const [filters, setFilters] = useState(NO_FILTERS);
  const trail = useCursorTrail();
  const page = useLeads({ ...filters, cursor: trail.cursor, limit: '25' });
  const canCreate = usePermissions().can('crm.lead.create');
  const filtered = filters.q !== '' || filters.status !== '';
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Filters
          onApply={(next) => {
            setFilters(next);
            trail.reset();
          }}
        />
        {canCreate ? (
          <Link href={CRM_PATHS.newLead} className={buttonVariants()}>
            Registrar prospecto
          </Link>
        ) : null}
      </div>
      <QueryState query={page} loadingLabel="Cargando los prospectos">
        {(data) => (
          <>
            <LeadTable leads={data.data} filtered={filtered} canCreate={canCreate} />
            <Pager page={data} {...trail.pager} />
          </>
        )}
      </QueryState>
    </div>
  );
}
