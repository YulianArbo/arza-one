'use client';

import { quoteStatusSchema, type QuoteSummary } from '@arza/contracts';
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
  useCursorTrail,
} from '@arza/ui';
import { FileText } from 'lucide-react';
import Link from 'next/link';
import { useState, type JSX, type SubmitEvent } from 'react';

import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { CRM_PATHS, QUOTE_STATUSES, QUOTE_STATUS_TONES, formatPesos, optionsOf } from './labels';
import { useQuotes } from './queries';

// Cotizaciones (B23, numeral 16.4, patrón de listado): las más recientes primero, una fila por
// cotización con su última versión. Se crean desde la ficha de la oportunidad.

const STATUS_OPTIONS = optionsOf(quoteStatusSchema.options, QUOTE_STATUSES, 'Todos');

interface QuoteFilters {
  readonly q: string;
  readonly status: string;
}

const NO_FILTERS: QuoteFilters = { q: '', status: '' };

function QuoteRow(props: {
  readonly quote: QuoteSummary;
  readonly showOpportunity: boolean;
}): JSX.Element {
  const { quote } = props;
  return (
    <TableRow>
      <TableCell>
        <Link
          href={CRM_PATHS.quote(quote.id)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {quote.code} · v{quote.version_number}
        </Link>
        {props.showOpportunity ? (
          <p className="text-xs text-muted-foreground">{quote.opportunity.title}</p>
        ) : null}
      </TableCell>
      <TableCell>{quote.party.name}</TableCell>
      <TableCell className="tabular-nums">{formatPesos(quote.total)}</TableCell>
      <TableCell>{formatDate(quote.valid_until)}</TableCell>
      <TableCell>
        <Badge tone={QUOTE_STATUS_TONES[quote.status]}>{QUOTE_STATUSES[quote.status]}</Badge>
      </TableCell>
    </TableRow>
  );
}

/** Tabla de cotizaciones, también para la ficha de la oportunidad. */
export function QuoteTable(props: {
  readonly quotes: readonly QuoteSummary[];
  readonly showOpportunity: boolean;
}): JSX.Element {
  return (
    <SimpleTable
      caption="Cotizaciones"
      headers={['Cotización', 'Cliente', 'Total', 'Válida hasta', 'Estado']}
    >
      {props.quotes.map((quote) => (
        <QuoteRow key={quote.id} quote={quote} showOpportunity={props.showOpportunity} />
      ))}
    </SimpleTable>
  );
}

function Filters({ onApply }: { readonly onApply: (filters: QuoteFilters) => void }): JSX.Element {
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
        id="buscar-cotizacion"
        label="Buscar por código o cliente"
        value={values.q}
        onChange={(event) => {
          setValues({ ...values, q: event.target.value });
        }}
      />
      <SelectField
        id="estado-cotizacion"
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

export function QuoteList(): JSX.Element {
  const [filters, setFilters] = useState(NO_FILTERS);
  const trail = useCursorTrail();
  const page = useQuotes({ ...filters, cursor: trail.cursor, limit: '25' });
  const filtered = filters.q !== '' || filters.status !== '';
  return (
    <div className="flex flex-col gap-4">
      <Filters
        onApply={(next) => {
          setFilters(next);
          trail.reset();
        }}
      />
      <QueryState query={page} loadingLabel="Cargando las cotizaciones">
        {(data) =>
          data.data.length === 0 ? (
            <EmptyState
              icon={<FileText />}
              title={
                filtered ? 'No hay cotizaciones con esos filtros' : 'Todavía no hay cotizaciones'
              }
              description={
                filtered
                  ? 'Cambie la búsqueda o el estado.'
                  : 'Las cotizaciones se crean desde la ficha de una oportunidad abierta del embudo.'
              }
            />
          ) : (
            <>
              <QuoteTable quotes={data.data} showOpportunity />
              <Pager page={data} {...trail.pager} />
            </>
          )
        }
      </QueryState>
    </div>
  );
}
