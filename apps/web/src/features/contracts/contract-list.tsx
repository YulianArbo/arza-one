'use client';

import { contractStatusSchema, type ContractSummary } from '@arza/contracts';
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
import { FileSignature } from 'lucide-react';
import Link from 'next/link';
import { useState, type JSX, type SubmitEvent } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { formatPesos, optionsOf } from '../crm/labels';
import { usePermissions } from '../session/permissions';
import { CONTRACT_KINDS, CONTRACT_PATHS, CONTRACT_STATUSES, CONTRACT_STATUS_TONES } from './labels';
import { useContracts } from './queries';

// Contratos (B24, numeral 16.4, patrón de listado): los más recientes primero, con su estado, su
// vigencia y si tiene cláusulas modificadas. Quien solo ve lo propio ve los suyos.

const STATUS_OPTIONS = optionsOf(contractStatusSchema.options, CONTRACT_STATUSES, 'Todos');

interface Filters {
  readonly q: string;
  readonly status: string;
}

const NO_FILTERS: Filters = { q: '', status: '' };

function ContractRow({ contract }: { readonly contract: ContractSummary }): JSX.Element {
  return (
    <TableRow>
      <TableCell>
        <Link
          href={CONTRACT_PATHS.contract(contract.id)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {contract.code}
        </Link>
        <p className="text-xs text-muted-foreground">
          {CONTRACT_KINDS[contract.kind]} · {contract.title}
        </p>
      </TableCell>
      <TableCell>{contract.party.name}</TableCell>
      <TableCell className="tabular-nums">{formatPesos(contract.value)}</TableCell>
      <TableCell>
        {formatDate(contract.starts_on)} – {formatDate(contract.ends_on)}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          <Badge tone={CONTRACT_STATUS_TONES[contract.status]}>
            {CONTRACT_STATUSES[contract.status]}
          </Badge>
          {contract.has_modified_clauses ? (
            <Badge tone="warning">Cláusulas modificadas</Badge>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

function SearchForm({ onApply }: { readonly onApply: (filters: Filters) => void }): JSX.Element {
  const [values, setValues] = useState(NO_FILTERS);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onApply(values);
  };
  return (
    <form
      onSubmit={submit}
      role="search"
      className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
    >
      <FormField
        id="buscar-contrato"
        label="Buscar por código, título o cliente"
        value={values.q}
        onChange={(event) => {
          setValues({ ...values, q: event.target.value });
        }}
      />
      <SelectField
        id="estado-contrato"
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

function Results(props: { readonly filters: Filters }): JSX.Element {
  const trail = useCursorTrail();
  const page = useContracts({ ...props.filters, cursor: trail.cursor, limit: '25' });
  const filtered = props.filters.q !== '' || props.filters.status !== '';
  return (
    <QueryState query={page} loadingLabel="Cargando los contratos">
      {(data) =>
        data.data.length === 0 ? (
          <EmptyState
            icon={<FileSignature />}
            title={filtered ? 'No hay contratos con esos filtros' : 'Todavía no hay contratos'}
            description={
              filtered
                ? 'Cambie la búsqueda o el estado.'
                : 'Genere el primero desde una plantilla o desde una cotización aceptada.'
            }
          />
        ) : (
          <>
            <SimpleTable
              caption="Contratos"
              scrollLabel="Contratos; desplácese a los lados para ver todas las columnas"
              headers={['Contrato', 'Cliente', 'Valor', 'Vigencia', 'Estado']}
            >
              {data.data.map((contract) => (
                <ContractRow key={contract.id} contract={contract} />
              ))}
            </SimpleTable>
            <Pager page={data} {...trail.pager} />
          </>
        )
      }
    </QueryState>
  );
}

export function ContractList(): JSX.Element {
  const { can } = usePermissions();
  const [filters, setFilters] = useState(NO_FILTERS);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Contratos"
        description="Contratos, acuerdos de confidencialidad y órdenes de servicio."
        action={
          can('contract.create') ? (
            <Link href={CONTRACT_PATHS.create} className={buttonVariants()}>
              Nuevo contrato
            </Link>
          ) : null
        }
      />
      <Link
        href={CONTRACT_PATHS.clauses}
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        Biblioteca de cláusulas
      </Link>
      <SearchForm onApply={setFilters} />
      {/* Con otros filtros, la lista vuelve a la primera página. */}
      <Results key={`${filters.q}|${filters.status}`} filters={filters} />
    </div>
  );
}
