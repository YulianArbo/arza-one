'use client';

import type { ContractDetail } from '@arza/contracts';
import { Alert, AlertDescription, Badge, Card, CardContent } from '@arza/ui';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { FactsCard, factLink, type Fact } from '../crm/crm-facts';
import { CRM_PATHS, formatPesos } from '../crm/labels';
import { partyPath } from '../parties/labels';
import { SectionTabs, type SectionTab } from '../parties/section-tabs';
import { RecordActivity } from '../records/record-activity';
import { AmendmentsPanel } from './amendments-panel';
import { ContractActions } from './contract-actions';
import {
  CLAUSE_ORIGINS,
  CLAUSE_ORIGIN_TONES,
  CONTRACT_KINDS,
  CONTRACT_RENEWALS,
  CONTRACT_STATUSES,
  CONTRACT_STATUS_TONES,
} from './labels';
import { SignaturesPanel } from '../signatures/signatures-panel';
import { ObligationsPanel } from './obligations-panel';
import { useContract } from './queries';

// Ficha del contrato (B24, numeral 16.3): estado, acciones permitidas y el expediente contractual en
// pestañas (resumen, texto cláusula por cláusula, obligaciones, firmas, otrosíes y expediente). La
// pestaña Firmas llega con el B25.

interface Props {
  readonly contract: ContractDetail;
}

const CONTRACT_WRITE = ['contract.update'] as const;

/** Lo que está pasando y lo que sigue, en una frase. */
function statusMessage(contract: ContractDetail): string | null {
  const { status, approval } = contract;
  if (status === 'draft' && approval.note !== null) {
    return `La Dirección lo devolvió: «${approval.note}». Corríjalo y vuelva a pedir la revisión.`;
  }
  if (status === 'in_review') {
    return contract.has_modified_clauses
      ? 'Tiene cláusulas modificadas o nuevas: la Dirección debe revisarlas una por una en esta ficha.'
      : 'Esperando la aprobación de la Dirección (en Mis tareas o en esta ficha).';
  }
  if (contract.pdf.status === 'pending')
    return 'Preparando el PDF definitivo. En unos segundos podrá descargarlo.';
  if (status === 'approved') {
    return 'Aprobado. Envíelo a firma electrónica en la pestaña Firmas, o imprima el PDF, recoja las firmas a mano y registre la copia firmada.';
  }
  if (status === 'in_signature') {
    return 'En firma electrónica. Siga el avance de cada firmante en la pestaña Firmas.';
  }
  if (status === 'expiring') {
    return `Vence el ${formatDate(contract.ends_on)}. El responsable tiene la tarea de revisarlo en Mis tareas.`;
  }
  return null;
}

function summaryFacts(contract: ContractDetail): Fact[] {
  const facts: Fact[] = [
    ['Tipo', `${CONTRACT_KINDS[contract.kind]} · ${contract.template.code}`],
    ['Cliente', factLink(partyPath(contract.party.id), contract.party.name)],
    ['Valor', formatPesos(contract.value)],
    ['Forma de pago', contract.payment_terms ?? '—'],
    ['Vigencia', `${formatDate(contract.starts_on)} – ${formatDate(contract.ends_on)}`],
    ['Renovación', CONTRACT_RENEWALS[contract.renewal]],
    ['Firma por el cliente', `${contract.client_signer_name} · ${contract.client_signer_document}`],
    ['Responsable', contract.responsible?.name ?? '—'],
    ['Elaboró', contract.author?.name ?? '—'],
    ['Creado', formatDateTime(contract.created_at)],
  ];
  if (contract.quote !== null) {
    facts.push([
      'Cotización',
      factLink(
        CRM_PATHS.quote(contract.quote.id),
        `${contract.quote.code} v${String(contract.quote.version_number)}`,
      ),
    ]);
  }
  if (contract.approval.decided_by !== null && contract.approval.decided_at !== null) {
    facts.push([
      'Decisión de la Dirección',
      `${contract.approval.decided_by.name} · ${formatDateTime(contract.approval.decided_at)}`,
    ]);
  }
  if (contract.approval.legal_note !== null)
    facts.push(['Concepto jurídico', contract.approval.legal_note]);
  if (contract.termination !== null) {
    facts.push([
      'Terminación',
      `${formatDate(contract.termination.terminated_on)} · ${contract.termination.reason}`,
    ]);
  }
  return facts;
}

function ClausesPanel({ contract }: Props): JSX.Element {
  return (
    <ol aria-label="Texto del contrato" className="flex flex-col gap-3">
      {contract.clauses.map((clause) => (
        <li key={clause.id}>
          <Card>
            <CardContent className="flex flex-col gap-2 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {clause.ordinal === null ? '' : `${clause.ordinal}. `}
                  {clause.title}
                </span>
                <Badge tone={CLAUSE_ORIGIN_TONES[clause.origin]}>
                  {CLAUSE_ORIGINS[clause.origin]}
                </Badge>
              </div>
              <p className="whitespace-pre-line text-sm">{clause.body}</p>
              {clause.library_text === null ? null : (
                <details className="text-sm">
                  <summary className="cursor-pointer text-primary">
                    Ver el texto de la biblioteca
                  </summary>
                  <p className="mt-2 whitespace-pre-line text-muted-foreground">
                    {clause.library_text}
                  </p>
                </details>
              )}
            </CardContent>
          </Card>
        </li>
      ))}
    </ol>
  );
}

function filesFacts(contract: ContractDetail): Fact[] {
  return [
    ['PDF aprobado', contract.pdf.file_name ?? 'Se genera al aprobar'],
    [
      'Huella del PDF (SHA-256)',
      <code key="huella" className="break-all text-xs">
        {contract.pdf.sha256 ?? '—'}
      </code>,
    ],
    [
      'Copia firmada',
      contract.signed === null
        ? 'Sin registrar'
        : `${contract.signed.file.file_name} · firmada el ${formatDate(contract.signed.signed_on)}`,
    ],
  ];
}

function CaseFilePanel({ contract }: Props): JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <FactsCard title="Documentos del contrato" facts={filesFacts(contract)} />
      <RecordActivity
        record={{ entity_type: 'ctr_contract', entity_id: contract.id }}
        writePermissions={CONTRACT_WRITE}
      />
    </div>
  );
}

/** Firma electrónica del contrato (B25): el seguimiento y, si está aprobado, el envío. */
function ContractSignatures({ contract }: Props): JSX.Element {
  return (
    <SignaturesPanel
      target={{ source: 'contract', id: contract.id }}
      canPrepare={contract.status === 'approved' && contract.pdf.status === 'ready'}
      empty="Cuando el contrato esté aprobado, envíelo aquí a firma electrónica: cada firmante recibe un enlace y un código en su correo."
    />
  );
}

function tabsOf(contract: ContractDetail): SectionTab[] {
  return [
    {
      id: 'resumen',
      label: 'Resumen',
      content: () => <FactsCard title="Datos del contrato" facts={summaryFacts(contract)} />,
    },
    { id: 'texto', label: 'Texto', content: () => <ClausesPanel contract={contract} /> },
    {
      id: 'obligaciones',
      label: 'Obligaciones',
      content: () => <ObligationsPanel contract={contract} />,
    },
    { id: 'firmas', label: 'Firmas', content: () => <ContractSignatures contract={contract} /> },
    { id: 'otrosies', label: 'Otrosíes', content: () => <AmendmentsPanel contract={contract} /> },
    { id: 'expediente', label: 'Expediente', content: () => <CaseFilePanel contract={contract} /> },
  ];
}

function Detail({ contract }: Props): JSX.Element {
  const message = statusMessage(contract);
  return (
    <>
      <PageHeader title={contract.code} description={`${contract.title} · ${contract.party.name}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={CONTRACT_STATUS_TONES[contract.status]}>
            {CONTRACT_STATUSES[contract.status]}
          </Badge>
          {contract.has_modified_clauses ? (
            <Badge tone="warning">Cláusulas modificadas</Badge>
          ) : null}
        </div>
      </PageHeader>
      {message === null ? null : (
        <Alert
          tone={
            contract.status === 'in_review' || contract.status === 'expiring' ? 'warning' : 'info'
          }
        >
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      <ContractActions contract={contract} />
      <SectionTabs label="Secciones del contrato" tabs={tabsOf(contract)} />
    </>
  );
}

export function ContractDetailPanel({ id }: { readonly id: string }): JSX.Element {
  const contract = useContract(id);
  return (
    <div className="flex flex-col gap-6">
      {/* «Volver a Contratos» está en la barra superior (B22B). */}
      <QueryState query={contract} loadingLabel="Cargando el contrato">
        {(data) => <Detail contract={data} />}
      </QueryState>
    </div>
  );
}
