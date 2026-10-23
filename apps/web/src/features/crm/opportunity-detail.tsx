'use client';

import { isOpenStage, type OpportunityDetail } from '@arza/contracts';
import { Badge } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { partyPath } from '../parties/labels';
import { ActivitiesPanel } from './activities-panel';
import { FactsCard, factLink, type Fact } from './crm-facts';
import { CRM_PATHS, OPPORTUNITY_STAGES, STAGE_TONES, formatPesos } from './labels';
import { OpportunityActions } from './opportunity-actions';
import { useOpportunity } from './queries';

// Ficha de la oportunidad (B22, numeral 16.3): etapa, acciones permitidas, valores y actividades.

function factsOf(opportunity: OpportunityDetail): Fact[] {
  const facts: Fact[] = [
    ['Cliente', factLink(partyPath(opportunity.party.id), opportunity.party.name)],
    [
      'Valor estimado',
      <span key="valor" className="tabular-nums">
        {formatPesos(opportunity.estimated_value)}
      </span>,
    ],
    ['Probabilidad', `${String(opportunity.probability)} %`],
    [
      'Valor ponderado',
      <span key="ponderado" className="tabular-nums">
        {formatPesos(opportunity.weighted_value)}
      </span>,
    ],
    ['Cierre esperado', formatDate(opportunity.expected_close)],
    ['Responsable', opportunity.owner?.name ?? '—'],
    ['Registrada', formatDateTime(opportunity.created_at)],
  ];
  if (opportunity.lead !== null) {
    facts.push([
      'Viene del prospecto',
      factLink(CRM_PATHS.lead(opportunity.lead.id), opportunity.lead.code),
    ]);
  }
  if (opportunity.closed_at !== null)
    facts.push(['Cerrada', formatDateTime(opportunity.closed_at)]);
  if (opportunity.lost_reason !== null) {
    const note = opportunity.lost_note === null ? '' : `: ${opportunity.lost_note}`;
    facts.push(['Motivo de pérdida', `${opportunity.lost_reason.label}${note}`]);
  }
  return facts;
}

function Detail({ opportunity }: { readonly opportunity: OpportunityDetail }): JSX.Element {
  return (
    <>
      <PageHeader title={opportunity.title} description={`Oportunidad ${opportunity.code}`} />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STAGE_TONES[opportunity.stage]}>{OPPORTUNITY_STAGES[opportunity.stage]}</Badge>
      </div>
      <OpportunityActions opportunity={opportunity} />
      <FactsCard title="Datos de la oportunidad" facts={factsOf(opportunity)} />
      <ActivitiesPanel
        target={{ leadId: null, opportunityId: opportunity.id }}
        open={isOpenStage(opportunity.stage)}
      />
    </>
  );
}

export function OpportunityDetailPanel({ id }: { readonly id: string }): JSX.Element {
  const opportunity = useOpportunity(id);
  return (
    <div className="flex flex-col gap-4">
      <Link
        href={CRM_PATHS.funnel}
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        ← Volver al embudo
      </Link>
      <QueryState query={opportunity} loadingLabel="Cargando la oportunidad">
        {(data) => <Detail opportunity={data} />}
      </QueryState>
    </div>
  );
}
