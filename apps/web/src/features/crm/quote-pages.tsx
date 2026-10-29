'use client';

import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { QueryState } from '../administration/query-state';
import { QuoteWizard } from './quote-wizard';
import { useOpportunity, useQuote } from './queries';

// Pantallas del asistente (B23): cotización nueva desde una oportunidad y edición de un borrador.

/** Cotización nueva: toma el cliente de la oportunidad. */
export function NewQuote({ opportunityId }: { readonly opportunityId: string }): JSX.Element {
  const opportunity = useOpportunity(opportunityId);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Nueva cotización"
        description="Elija la vigencia, agregue los ítems y escriba las condiciones."
      />
      <QueryState query={opportunity} loadingLabel="Cargando la oportunidad">
        {(data) => (
          <QuoteWizard
            quote={null}
            target={{ opportunityId, clientName: data.party.name, opportunityTitle: data.title }}
          />
        )}
      </QueryState>
    </div>
  );
}

/** Edición de un borrador; las demás se cambian con una versión nueva. */
export function EditQuote({ id }: { readonly id: string }): JSX.Element {
  const quote = useQuote(id);
  return (
    <QueryState query={quote} loadingLabel="Cargando la cotización">
      {(data) => (
        <div className="flex flex-col gap-4">
          <PageHeader
            title={`Editar ${data.code} · versión ${String(data.version_number)}`}
            description="Solo un borrador se edita. Los totales se recalculan con las tarifas de hoy."
          />
          {data.status === 'draft' ? (
            <QuoteWizard
              quote={data}
              target={{
                opportunityId: data.opportunity.id,
                clientName: data.party.name,
                opportunityTitle: data.opportunity.title,
              }}
            />
          ) : (
            <p>Esta cotización ya no es un borrador: cree una versión nueva desde su ficha.</p>
          )}
        </div>
      )}
    </QueryState>
  );
}
