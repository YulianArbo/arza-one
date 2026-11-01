'use client';

import type { PartyDetail } from '@arza/contracts';
import { Badge } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { QueryState } from '../administration/query-state';
import { RecordDialog } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { BankAccountsPanel } from './bank-accounts-panel';
import { ContactsPanel } from './contacts-panel';
import { DueDiligencePanel } from './due-diligence-panel';
import {
  DUE_DILIGENCE_LABELS,
  DUE_DILIGENCE_TONES,
  KIND_LABELS,
  PARTIES_PATH,
  STATUS_LABELS,
  STATUS_TONES,
  identification,
} from './labels';
import { MergeDialog } from './merge-dialog';
import { PartyForm } from './party-form';
import { PartyLogo } from './party-logo';
import { useParty } from './queries';
import { RecordActivity } from '../records/record-activity';
import { SectionTabs, type SectionTab } from './section-tabs';
import { StatusActions } from './status-actions';
import { SummaryPanel } from './summary-panel';
import { TimelinePanel } from './timeline-panel';

// Ficha del tercero (ficha 17.3, numeral 16.3): encabezado con estado y acciones permitidas, y
// pestañas de resumen, contactos, cuentas, conocimiento y línea de tiempo.

function Actions({ party }: { readonly party: PartyDetail }): JSX.Element {
  const permissions = usePermissions();
  return (
    <div className="flex flex-wrap items-start gap-2">
      {permissions.can('party.update') ? (
        <>
          <RecordDialog
            triggerLabel="Editar"
            variant="outline"
            title={`Editar ${party.name}`}
            description="Los cambios quedan en la auditoría."
          >
            {(close) => <PartyForm party={party} onSaved={close} />}
          </RecordDialog>
          <StatusActions party={party} />
        </>
      ) : null}
      {permissions.can('party.merge') ? <MergeDialog party={party} /> : null}
    </div>
  );
}

/** Quien crea o edita terceros puede comentarlos y adjuntarles archivos (la API lo revisa). */
const PARTY_WRITE = ['party.create', 'party.update'] as const;

function tabsOf(party: PartyDetail, canSeeAccounts: boolean): SectionTab[] {
  const tabs: (SectionTab | null)[] = [
    { id: 'resumen', label: 'Resumen', content: () => <SummaryPanel party={party} /> },
    { id: 'contactos', label: 'Contactos', content: () => <ContactsPanel party={party} /> },
    canSeeAccounts
      ? {
          id: 'cuentas',
          label: 'Cuentas bancarias',
          content: () => <BankAccountsPanel party={party} />,
        }
      : null,
    {
      id: 'conocimiento',
      label: 'Conocimiento',
      content: () => <DueDiligencePanel party={party} />,
    },
    {
      id: 'comentarios',
      label: 'Comentarios y adjuntos',
      content: () => (
        <RecordActivity
          record={{ entity_type: 'party', entity_id: party.id }}
          writePermissions={PARTY_WRITE}
        />
      ),
    },
    {
      id: 'linea-de-tiempo',
      label: 'Línea de tiempo',
      content: () => <TimelinePanel partyId={party.id} />,
    },
  ];
  return tabs.filter((tab) => tab !== null);
}

function Detail({ party }: { readonly party: PartyDetail }): JSX.Element {
  const canSeeAccounts = usePermissions().can('party.bank_account.read');
  return (
    <>
      <PageHeader
        title={party.name}
        description={`${KIND_LABELS[party.kind]} · ${identification(party)}`}
      />
      <div className="flex flex-wrap gap-2">
        <Badge tone={STATUS_TONES[party.status]}>{STATUS_LABELS[party.status]}</Badge>
        <Badge tone={DUE_DILIGENCE_TONES[party.due_diligence.state]}>
          {DUE_DILIGENCE_LABELS[party.due_diligence.state]}
        </Badge>
      </div>
      <Actions party={party} />
      <PartyLogo party={party} />
      <SectionTabs label={`Ficha de ${party.name}`} tabs={tabsOf(party, canSeeAccounts)} />
    </>
  );
}

export function PartyDetailPanel({ id }: { readonly id: string }): JSX.Element {
  const party = useParty(id);
  return (
    <div className="flex flex-col gap-4">
      <Link
        href={PARTIES_PATH}
        className="inline-flex min-h-6 items-center self-start text-sm text-primary underline-offset-4 hover:underline"
      >
        ← Volver a Terceros
      </Link>
      <QueryState query={party} loadingLabel="Cargando la ficha del tercero">
        {(data) => <Detail party={data} />}
      </QueryState>
    </div>
  );
}
