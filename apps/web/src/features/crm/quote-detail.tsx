'use client';

import type { QuoteDetail } from '@arza/contracts';
import {
  Alert,
  AlertDescription,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  SimpleTable,
  TableCell,
  TableRow,
} from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { partyPath } from '../parties/labels';
import { FactsCard, factLink, type Fact } from './crm-facts';
import {
  CRM_PATHS,
  QUOTE_STATUSES,
  QUOTE_STATUS_TONES,
  SERVICE_UNITS,
  formatPesos,
  formatRate,
} from './labels';
import { QuoteActions } from './quote-actions';
import { useQuote } from './queries';

// Ficha de la cotización (B23, numeral 16.3): estado, acciones permitidas, ítems y totales,
// condiciones, aprobación, envío, la evidencia de la respuesta del cliente y sus versiones.

interface Props {
  readonly quote: QuoteDetail;
}

function factsOf(quote: QuoteDetail): Fact[] {
  const facts: Fact[] = [
    ['Cliente', factLink(partyPath(quote.party.id), quote.party.name)],
    ['Oportunidad', factLink(CRM_PATHS.opportunity(quote.opportunity.id), quote.opportunity.title)],
    ['Válida hasta', formatDate(quote.valid_until)],
    ['Elaboró', quote.author?.name ?? '—'],
    ['Creada', formatDateTime(quote.created_at)],
  ];
  if (quote.recipient !== null) {
    facts.push(['Enviada a', `${quote.recipient.name} · ${quote.recipient.email}`]);
  }
  if (quote.sent_at !== null) facts.push(['Enviada', formatDateTime(quote.sent_at)]);
  return facts;
}

/** Lo que está pasando y lo que sigue, en una frase. */
function statusMessage(quote: QuoteDetail): string | null {
  if (quote.status === 'in_approval') {
    return `Un descuento (${formatRate(quote.approval.largest_discount)}) pasa el tope de ${formatRate(quote.approval.discount_cap ?? '0')}: la Dirección debe aprobarla en Mis tareas o en esta ficha.`;
  }
  if (quote.status === 'draft' && quote.approval.note !== null) {
    return `La Dirección la devolvió: «${quote.approval.note}». Corríjala y vuelva a pedir el envío.`;
  }
  if (quote.pdf.status === 'pending') return 'Preparando el PDF. En unos segundos podrá enviarla.';
  if (quote.status === 'sent' && quote.email_sent_at === null) {
    return 'Enviando el correo con el enlace al cliente…';
  }
  if (quote.status === 'superseded') return 'Esta versión fue reemplazada por una más reciente.';
  return null;
}

function TotalsList({ quote }: Props): JSX.Element {
  return (
    <dl aria-label="Totales" className="ml-auto grid grid-cols-[auto_auto] gap-x-6 gap-y-1">
      <dt>Subtotal</dt>
      <dd className="text-right tabular-nums">{formatPesos(quote.subtotal)}</dd>
      <dt>Descuentos</dt>
      <dd className="text-right tabular-nums">{formatPesos(quote.discount_total)}</dd>
      {quote.taxes.map((tax) => (
        <div key={tax.tax_rate} className="contents">
          <dt>IVA {formatRate(tax.tax_rate)}</dt>
          <dd className="text-right tabular-nums">{formatPesos(tax.tax)}</dd>
        </div>
      ))}
      <dt className="font-semibold">Total</dt>
      <dd className="text-right font-semibold tabular-nums">{formatPesos(quote.total)}</dd>
    </dl>
  );
}

function ItemRow({ item }: { readonly item: QuoteDetail['items'][number] }): JSX.Element {
  return (
    <TableRow>
      <TableCell>{item.position}</TableCell>
      <TableCell>
        {item.description}
        <span className="block text-xs text-muted-foreground">
          {SERVICE_UNITS[item.unit]}
          {item.service === null ? '' : ` · ${item.service.code}`}
        </span>
      </TableCell>
      <TableCell className="tabular-nums">{formatRate(item.quantity).replace(' %', '')}</TableCell>
      <TableCell className="tabular-nums">{formatPesos(item.unit_price)}</TableCell>
      <TableCell className="tabular-nums">{formatRate(item.discount_percent)}</TableCell>
      <TableCell className="tabular-nums">{formatRate(item.tax_rate)}</TableCell>
      <TableCell className="tabular-nums">{formatPesos(item.line_total)}</TableCell>
    </TableRow>
  );
}

function ItemsCard({ quote }: Props): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ítems</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SimpleTable
          caption="Ítems de la cotización"
          headers={['#', 'Descripción', 'Cantidad', 'Valor unitario', 'Desc.', 'IVA', 'Total']}
        >
          {quote.items.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </SimpleTable>
        <TotalsList quote={quote} />
      </CardContent>
    </Card>
  );
}

function conditionsOf(quote: QuoteDetail): Fact[] {
  const facts: Fact[] = [
    ['Forma de pago', quote.conditions.payment_terms],
    ['Plazo de entrega', quote.conditions.delivery_terms],
    ['Garantía', quote.conditions.warranty ?? '—'],
  ];
  if (quote.notes !== null) facts.push(['Notas', quote.notes]);
  if (quote.approval.decided_by !== null && quote.approval.decided_at !== null) {
    facts.push([
      'Decisión de la Dirección',
      `${quote.approval.decided_by.name} · ${formatDateTime(quote.approval.decided_at)}`,
    ]);
  }
  return facts;
}

function evidenceOf(response: NonNullable<QuoteDetail['response']>): Fact[] {
  return [
    ['Respuesta', response.decision === 'accepted' ? 'Aceptada' : 'Rechazada'],
    ['Fecha y hora', formatDateTime(response.at)],
    ['Quién respondió', response.by_name ?? '—'],
    ['Motivo', response.reason ?? '—'],
    ['Dirección IP', response.ip ?? '—'],
    ['Navegador', response.user_agent ?? '—'],
    [
      'Huella del PDF (SHA-256)',
      <code key="huella" className="break-all text-xs">
        {response.pdf_sha256 ?? '—'}
      </code>,
    ],
  ];
}

function VersionsCard({ quote }: Props): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Versiones</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2 text-sm">
          {quote.versions.map((version) => (
            <li key={version.id} className="flex flex-wrap items-center gap-2">
              {version.id === quote.id ? (
                <span className="font-medium">Versión {version.version_number} (esta)</span>
              ) : (
                factLink(CRM_PATHS.quote(version.id), `Versión ${String(version.version_number)}`)
              )}
              <Badge tone={QUOTE_STATUS_TONES[version.status]}>
                {QUOTE_STATUSES[version.status]}
              </Badge>
              <span className="tabular-nums text-muted-foreground">
                {formatPesos(version.total)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Detail({ quote }: Props): JSX.Element {
  const message = statusMessage(quote);
  return (
    <>
      <PageHeader
        title={`${quote.code} · versión ${String(quote.version_number)}`}
        description={`Cotización para ${quote.party.name}`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={QUOTE_STATUS_TONES[quote.status]}>{QUOTE_STATUSES[quote.status]}</Badge>
      </div>
      {message === null ? null : (
        <Alert tone={quote.status === 'in_approval' ? 'warning' : 'info'}>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      <QuoteActions quote={quote} />
      <FactsCard title="Datos de la cotización" facts={factsOf(quote)} />
      <ItemsCard quote={quote} />
      <FactsCard title="Condiciones" facts={conditionsOf(quote)} />
      {quote.response === null ? null : (
        <FactsCard
          title="Evidencia de la respuesta del cliente"
          facts={evidenceOf(quote.response)}
        />
      )}
      <VersionsCard quote={quote} />
    </>
  );
}

export function QuoteDetailPanel({ id }: { readonly id: string }): JSX.Element {
  const quote = useQuote(id);
  return (
    <div className="flex flex-col gap-4">
      <Link
        href={CRM_PATHS.quotes}
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        ← Volver a las cotizaciones
      </Link>
      <QueryState query={quote} loadingLabel="Cargando la cotización">
        {(data) => <Detail quote={data} />}
      </QueryState>
    </div>
  );
}
