'use client';

import { partyRoleSchema, partyStatusSchema, type PartySummary } from '@arza/contracts';
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
import { BookUser } from 'lucide-react';
import Link from 'next/link';
import { useState, type JSX, type SubmitEvent } from 'react';

import { QueryState } from '../administration/query-state';
import { usePermissions } from '../session/permissions';
import {
  KIND_LABELS,
  NEW_PARTY_PATH,
  ROLE_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  identification,
  optionsFrom,
  partyPath,
} from './labels';
import { useParties, type PartyFilters } from './queries';

const NO_FILTERS: PartyFilters = { q: '', role: '', status: '' };
const ROLE_OPTIONS = [
  { value: '', label: 'Todos' },
  ...optionsFrom(partyRoleSchema.options, ROLE_LABELS),
];
const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  ...optionsFrom(partyStatusSchema.options, STATUS_LABELS),
];

function PartyRow({ party }: { readonly party: PartySummary }): JSX.Element {
  return (
    <TableRow>
      <TableCell>
        <Link
          href={partyPath(party.id)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {party.name}
        </Link>
        <p className="text-xs text-muted-foreground">{KIND_LABELS[party.kind]}</p>
      </TableCell>
      <TableCell>{identification(party)}</TableCell>
      <TableCell>
        {party.roles.map((role) => ROLE_LABELS[role]).join(', ') || 'Sin papel'}
      </TableCell>
      <TableCell>{party.city ?? '—'}</TableCell>
      <TableCell>
        <Badge tone={STATUS_TONES[party.status]}>{STATUS_LABELS[party.status]}</Badge>
      </TableCell>
    </TableRow>
  );
}

function PartyTable(props: {
  readonly parties: readonly PartySummary[];
  readonly filtered: boolean;
  readonly canCreate: boolean;
}): JSX.Element {
  if (props.parties.length === 0) {
    return (
      <EmptyState
        icon={<BookUser />}
        title={props.filtered ? 'No hay terceros con esos filtros' : 'Todavía no hay terceros'}
        description={
          props.filtered
            ? 'Cambie la búsqueda, el papel o el estado.'
            : 'Registre los clientes, proveedores y contactos con que la empresa se relaciona.'
        }
        action={
          props.canCreate && !props.filtered ? (
            <Link href={NEW_PARTY_PATH} className={buttonVariants()}>
              Registrar un tercero
            </Link>
          ) : undefined
        }
      />
    );
  }
  return (
    <SimpleTable headers={['Tercero', 'Documento', 'Papeles', 'Ciudad', 'Estado']}>
      {props.parties.map((party) => (
        <PartyRow key={party.id} party={party} />
      ))}
    </SimpleTable>
  );
}

const SELECTS = [
  ['papel-tercero', 'Papel', 'role', ROLE_OPTIONS],
  ['estado-tercero', 'Estado', 'status', STATUS_OPTIONS],
] as const;

function Filters({ onApply }: { readonly onApply: (filters: PartyFilters) => void }): JSX.Element {
  const [values, setValues] = useState(NO_FILTERS);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onApply(values);
  };
  return (
    <form
      onSubmit={submit}
      role="search"
      className="grid gap-3 sm:grid-cols-[1fr_10rem_10rem_auto] sm:items-end"
    >
      <FormField
        id="buscar-tercero"
        label="Buscar por nombre, documento o correo"
        value={values.q}
        onChange={(event) => {
          setValues({ ...values, q: event.target.value });
        }}
      />
      {SELECTS.map(([id, label, key, options]) => (
        <SelectField
          key={id}
          id={id}
          label={label}
          options={options}
          value={values[key]}
          onChange={(event) => {
            setValues({ ...values, [key]: event.target.value });
          }}
        />
      ))}
      <Button type="submit" variant="outline">
        Buscar
      </Button>
    </form>
  );
}

/** Terceros de la empresa, por páginas (numeral 16.4, patrón de listado). */
export function PartyList(): JSX.Element {
  const [filters, setFilters] = useState(NO_FILTERS);
  const trail = useCursorTrail();
  const page = useParties(filters, trail.cursor);
  const canCreate = usePermissions().can('party.create');
  const filtered = filters.q !== '' || filters.role !== '' || filters.status !== '';
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
          <Link href={NEW_PARTY_PATH} className={buttonVariants()}>
            Registrar un tercero
          </Link>
        ) : null}
      </div>
      <QueryState query={page} loadingLabel="Cargando los terceros">
        {(data) => (
          <>
            <PartyTable parties={data.data} filtered={filtered} canCreate={canCreate} />
            <Pager page={data} {...trail.pager} />
          </>
        )}
      </QueryState>
    </div>
  );
}
