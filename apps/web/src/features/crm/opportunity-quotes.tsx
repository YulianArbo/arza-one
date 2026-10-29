'use client';

import { buttonVariants, Card, CardContent, CardHeader, CardTitle } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { QueryState } from '../administration/query-state';
import { usePermissions } from '../session/permissions';
import { CRM_PATHS } from './labels';
import { QuoteTable } from './quote-list';
import { useQuotes } from './queries';

// Cotizaciones de una oportunidad (B23), en su ficha: la última versión de cada una y el botón
// para crear otra mientras la oportunidad siga abierta.

export function OpportunityQuotes(props: {
  readonly opportunityId: string;
  readonly open: boolean;
}): JSX.Element | null {
  const { can } = usePermissions();
  const canRead = can('crm.quote.read');
  const quotes = useQuotes({ opportunity_id: props.opportunityId, limit: '50' }, canRead);
  if (!canRead) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-base">Cotizaciones</CardTitle>
        {props.open && can('crm.quote.create') ? (
          <Link
            href={CRM_PATHS.newQuote(props.opportunityId)}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Nueva cotización
          </Link>
        ) : null}
      </CardHeader>
      <CardContent>
        <QueryState query={quotes} loadingLabel="Cargando las cotizaciones">
          {(data) =>
            data.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Esta oportunidad todavía no tiene cotizaciones.
              </p>
            ) : (
              <QuoteTable quotes={data.data} showOpportunity={false} />
            )
          }
        </QueryState>
      </CardContent>
    </Card>
  );
}
