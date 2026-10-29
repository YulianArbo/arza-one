'use client';

import type { PublicQuote } from '@arza/contracts';
import { SimpleTable, TableCell, TableRow } from '@arza/ui';
import type { JSX } from 'react';

import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { SERVICE_UNITS, formatPesos, formatRate } from '../crm/labels';

// Partes de la cotización que ve el cliente (B23): ítems, totales y condiciones.

export function ItemsTable({ quote }: { readonly quote: PublicQuote }): JSX.Element {
  return (
    <SimpleTable
      caption="Servicios cotizados"
      headers={['Descripción', 'Cantidad', 'Valor unitario', 'Desc.', 'IVA', 'Total']}
    >
      {quote.items.map((item) => (
        <TableRow key={item.position}>
          <TableCell>
            {item.description}
            <span className="block text-xs text-muted-foreground">{SERVICE_UNITS[item.unit]}</span>
          </TableCell>
          <TableCell className="tabular-nums">
            {formatRate(item.quantity).replace(' %', '')}
          </TableCell>
          <TableCell className="tabular-nums">{formatPesos(item.unit_price)}</TableCell>
          <TableCell className="tabular-nums">{formatRate(item.discount_percent)}</TableCell>
          <TableCell className="tabular-nums">{formatRate(item.tax_rate)}</TableCell>
          <TableCell className="tabular-nums">{formatPesos(item.line_total)}</TableCell>
        </TableRow>
      ))}
    </SimpleTable>
  );
}

export function Totals({ quote }: { readonly quote: PublicQuote }): JSX.Element {
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

export function Conditions({ quote }: { readonly quote: PublicQuote }): JSX.Element {
  const rows: [string, string][] = [
    ['Forma de pago', quote.conditions.payment_terms],
    ['Plazo de entrega', quote.conditions.delivery_terms],
  ];
  if (quote.conditions.warranty !== null) rows.push(['Garantía', quote.conditions.warranty]);
  if (quote.notes !== null) rows.push(['Notas', quote.notes]);
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map(([term, value]) => (
        <div key={term}>
          <dt className="text-xs text-muted-foreground">{term}</dt>
          <dd className="text-sm whitespace-pre-line">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Lo que el cliente puede hacer o lo que ya pasó, en una frase. */
export function stateMessage(quote: PublicQuote): string {
  if (quote.state === 'accepted') {
    return `La aceptó ${quote.responded_by ?? ''} el ${quote.responded_at === null ? '' : formatDateTime(quote.responded_at)}. Gracias.`;
  }
  if (quote.state === 'rejected') return 'Usted rechazó esta cotización. Gracias por responder.';
  if (quote.state === 'expired') {
    return `Esta cotización venció el ${formatDate(quote.valid_until)} y ya no puede aceptarse. Pida una nueva a quien se la envió.`;
  }
  if (quote.state === 'replaced') {
    return 'Hay una versión más reciente de esta cotización. Use el enlace del correo más reciente.';
  }
  return `Puede aceptarla o rechazarla hasta el ${formatDate(quote.valid_until)} (hora de Colombia).`;
}
