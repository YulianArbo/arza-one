'use client';

import { OPEN_STAGES, type OpenStage, type OpportunitySummary } from '@arza/contracts';
import {
  Badge,
  Button,
  buttonVariants,
  EmptyState,
  SelectField,
  SimpleTable,
  TableCell,
  TableRow,
} from '@arza/ui';
import { BriefcaseBusiness } from 'lucide-react';
import Link from 'next/link';
import { useState, type JSX } from 'react';

import { useDropZone } from '../../components/drop-zone';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { usePermissions } from '../session/permissions';
import { useCrmAction } from './crm-action';
import { CRM_PATHS, OPPORTUNITY_STAGES, STAGE_TONES, bogotaToday, formatPesos } from './labels';
import { OPPORTUNITY_DRAG, OpportunityCard } from './opportunity-card';
import { useOpportunities } from './queries';

// Embudo de oportunidades (B22, ficha 17.6; numeral 16.4): el tablero con una columna por etapa
// abierta y la tabla con todas, abiertas y cerradas. Un cierre que ya pasó se marca «Vencida».

type View = 'board' | 'table';

interface Move {
  readonly opportunity: OpportunitySummary;
  readonly stage: OpenStage;
}

function useMove() {
  const api = useApiClient();
  return useCrmAction<Move>(({ opportunity, stage }, csrfToken) =>
    api.post(`/v1/crm/opportunities/${opportunity.id}/actions/move`, {
      body: { stage, probability: null },
      version: opportunity.version,
      csrfToken,
    }),
  );
}

function sumOf(opportunities: readonly OpportunitySummary[]): string {
  const cents = opportunities.reduce(
    (total, row) => total + Math.round(Number(row.estimated_value) * 100),
    0,
  );
  return (cents / 100).toFixed(2);
}

interface ColumnProps {
  readonly stage: OpenStage;
  readonly opportunities: readonly OpportunitySummary[];
  readonly canMove: boolean;
  readonly onMove: (opportunity: OpportunitySummary, stage: OpenStage) => void;
  readonly onDrop: (id: string, stage: OpenStage) => void;
}

function ColumnHeader(props: ColumnProps & { readonly headingId: string }): JSX.Element {
  return (
    <header className="flex flex-col gap-1 px-1">
      <h2 id={props.headingId} className="font-heading text-base font-semibold">
        {OPPORTUNITY_STAGES[props.stage]}{' '}
        <span className="text-sm font-medium text-primary tabular-nums">
          ({props.opportunities.length})
        </span>
      </h2>
      <span className="text-sm tabular-nums text-muted-foreground">
        {formatPesos(sumOf(props.opportunities))}
      </span>
    </header>
  );
}

/**
 * Columna del tablero. Soltar una tarjeta aquí con el ratón es un atajo de «Mover a…», que es la
 * forma que también sirve con el teclado (numeral 16.6).
 */
function Column(props: ColumnProps): JSX.Element {
  const today = bogotaToday();
  const headingId = `etapa-${props.stage}`;
  const zone = useDropZone(OPPORTUNITY_DRAG, props.canMove, (id) => {
    props.onDrop(id, props.stage);
  });
  return (
    <section aria-labelledby={headingId} className="flex min-w-60 flex-1">
      <div ref={zone} className="flex flex-1 flex-col gap-3 rounded-xl bg-muted p-3">
        <ColumnHeader {...props} headingId={headingId} />
        <ul className="flex flex-col gap-2">
          {props.opportunities.map((opportunity) => (
            <OpportunityCard
              key={opportunity.id}
              opportunity={opportunity}
              canMove={props.canMove}
              overdue={opportunity.expected_close < today}
              onMove={props.onMove}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

function Board({ opportunities }: { readonly opportunities: readonly OpportunitySummary[] }) {
  const move = useMove();
  const canMove = usePermissions().can('crm.opportunity.update');
  const onMove = (opportunity: OpportunitySummary, stage: OpenStage): void => {
    move.execute({ opportunity, stage });
  };
  const onDrop = (id: string, stage: OpenStage): void => {
    const opportunity = opportunities.find((row) => row.id === id);
    if (opportunity !== undefined && opportunity.stage !== stage) onMove(opportunity, stage);
  };
  return (
    <div className="flex flex-col gap-3">
      {move.error === null ? null : <FormError error={move.error} />}
      <div className="flex gap-3 overflow-x-auto pb-2" aria-busy={move.pending}>
        {OPEN_STAGES.map((stage) => (
          <Column
            key={stage}
            stage={stage}
            opportunities={opportunities.filter((row) => row.stage === stage)}
            canMove={canMove}
            onMove={onMove}
            onDrop={onDrop}
          />
        ))}
      </div>
      {move.dialog}
    </div>
  );
}

function OpportunityRow({ row }: { readonly row: OpportunitySummary }): JSX.Element {
  return (
    <TableRow>
      <TableCell>
        <Link
          href={CRM_PATHS.opportunity(row.id)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {row.title}
        </Link>
        <p className="text-xs text-muted-foreground">{row.code}</p>
      </TableCell>
      <TableCell>{row.party.name}</TableCell>
      <TableCell>
        <Badge tone={STAGE_TONES[row.stage]}>{OPPORTUNITY_STAGES[row.stage]}</Badge>
      </TableCell>
      <TableCell className="tabular-nums">{formatPesos(row.estimated_value)}</TableCell>
      <TableCell className="tabular-nums">{String(row.probability)} %</TableCell>
      <TableCell>{formatDate(row.expected_close)}</TableCell>
      <TableCell>{row.owner?.name ?? '—'}</TableCell>
    </TableRow>
  );
}

const TABLE_HEADERS = [
  'Oportunidad',
  'Cliente',
  'Etapa',
  'Valor',
  'Prob.',
  'Cierre',
  'Responsable',
];

function Table({ opportunities }: { readonly opportunities: readonly OpportunitySummary[] }) {
  return (
    <SimpleTable headers={TABLE_HEADERS} scrollLabel="Oportunidades">
      {opportunities.map((row) => (
        <OpportunityRow key={row.id} row={row} />
      ))}
    </SimpleTable>
  );
}

const STAGE_FILTER = [
  { value: 'open', label: 'Abiertas' },
  { value: 'closed', label: 'Ganadas y perdidas' },
  { value: 'all', label: 'Todas' },
];

function Empty({ canCreate }: { readonly canCreate: boolean }): JSX.Element {
  return (
    <EmptyState
      icon={<BriefcaseBusiness />}
      title="No hay oportunidades aquí"
      description="Convierta un prospecto calificado o registre una oportunidad para un cliente."
      action={
        canCreate ? (
          <Link href={CRM_PATHS.newOpportunity} className={buttonVariants()}>
            Registrar oportunidad
          </Link>
        ) : undefined
      }
    />
  );
}

function ViewSwitch(props: { readonly view: View; readonly onChange: (view: View) => void }) {
  return (
    <div role="group" aria-label="Forma de ver el embudo" className="flex gap-1">
      {(['board', 'table'] as const).map((view) => (
        <Button
          key={view}
          type="button"
          size="sm"
          variant={props.view === view ? 'secondary' : 'ghost'}
          aria-pressed={props.view === view}
          onClick={() => {
            props.onChange(view);
          }}
        >
          {view === 'board' ? 'Tablero' : 'Tabla'}
        </Button>
      ))}
    </div>
  );
}

/** El embudo, en tablero o en tabla. */
export function FunnelBoard(): JSX.Element {
  const [view, setView] = useState<View>('board');
  const [scope, setScope] = useState('open');
  const canCreate = usePermissions().can('crm.opportunity.create');
  const query = useOpportunities({ view: view === 'board' ? 'open' : scope, limit: '200' });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <ViewSwitch view={view} onChange={setView} />
        {view === 'table' ? (
          <SelectField
            id="embudo-alcance"
            label="Mostrar"
            options={STAGE_FILTER}
            value={scope}
            onChange={(event) => {
              setScope(event.target.value);
            }}
          />
        ) : null}
        {canCreate ? (
          <Link href={CRM_PATHS.newOpportunity} className={buttonVariants()}>
            Registrar oportunidad
          </Link>
        ) : null}
      </div>
      <QueryState query={query} loadingLabel="Cargando el embudo">
        {(data) => {
          if (data.data.length === 0) return <Empty canCreate={canCreate} />;
          return view === 'board' ? (
            <Board opportunities={data.data} />
          ) : (
            <Table opportunities={data.data} />
          );
        }}
      </QueryState>
    </div>
  );
}
