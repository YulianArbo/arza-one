'use client';

import type { LeadDetail } from '@arza/contracts';
import { Badge } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { partyPath } from '../parties/labels';
import { ActivitiesPanel } from './activities-panel';
import { FactsCard, factLink, type Fact } from './crm-facts';
import { CRM_PATHS, LEAD_STATUSES, LEAD_STATUS_TONES } from './labels';
import { LeadActions } from './lead-actions';
import { useLead } from './queries';

// Ficha del prospecto (B22, numeral 16.3): estado, acciones permitidas, sus datos, la autorización
// de tratamiento y sus actividades.

function factsOf(lead: LeadDetail): Fact[] {
  const facts: Fact[] = [
    ['Persona', factLink(partyPath(lead.person.id), lead.person.name)],
    ['Correo', lead.email ?? '—'],
    ['Teléfono', lead.phone ?? '—'],
    ['Empresa', lead.company_name ?? '—'],
    ['Origen', lead.source.label],
    ['Campaña', lead.campaign?.name ?? '—'],
    ['Responsable', lead.owner?.name ?? '—'],
    ['Registrado', formatDateTime(lead.created_at)],
    [
      'Autorización de datos',
      `Del ${formatDate(lead.consent.granted_on)} · ${String(lead.consent.purposes.length)} finalidad(es)`,
    ],
  ];
  if (lead.discard_reason !== null) {
    facts.push([
      'Motivo del descarte',
      lead.discard_note === null
        ? lead.discard_reason.label
        : `${lead.discard_reason.label}: ${lead.discard_note}`,
    ]);
  }
  if (lead.opportunity !== null) {
    const { id, code } = lead.opportunity;
    facts.push(['Oportunidad', factLink(CRM_PATHS.opportunity(id), code)]);
  }
  return facts;
}

function Detail({ lead }: { readonly lead: LeadDetail }): JSX.Element {
  const open = lead.status === 'new' || lead.status === 'qualified';
  return (
    <>
      <PageHeader title={lead.person.name} description={`Prospecto ${lead.code}`} />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={LEAD_STATUS_TONES[lead.status]}>{LEAD_STATUSES[lead.status]}</Badge>
      </div>
      <LeadActions lead={lead} />
      <section aria-labelledby="necesidad" className="rounded-md border p-4">
        <h2 id="necesidad" className="mb-1 text-sm font-semibold">
          Qué necesita
        </h2>
        <p className="whitespace-pre-line text-sm">{lead.need}</p>
      </section>
      <FactsCard title="Datos del prospecto" facts={factsOf(lead)} />
      <ActivitiesPanel target={{ leadId: lead.id, opportunityId: null }} open={open} />
    </>
  );
}

export function LeadDetailPanel({ id }: { readonly id: string }): JSX.Element {
  const lead = useLead(id);
  return (
    <div className="flex flex-col gap-4">
      <Link
        href={CRM_PATHS.leads}
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        ← Volver a Prospectos
      </Link>
      <QueryState query={lead} loadingLabel="Cargando la ficha del prospecto">
        {(data) => <Detail lead={data} />}
      </QueryState>
    </div>
  );
}
