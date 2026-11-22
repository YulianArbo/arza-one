'use client';

import { IP_KINDS, IP_STATUSES, ipAssetListResponseSchema, type IpAsset } from '@arza/contracts';
import { Badge, Button, PageHeader } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import type { DownloadedFile } from '../../lib/api/api-client';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { FormError, FormSuccess } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { save } from '../audit/audit-export-button';
import { HrList, HrSection } from '../hr/hr-dialog';
import { useHrAction } from '../hr/hr-queries';
import { IpAssetForm } from './ip-asset-form';
import { useInnQuery } from './innovation-queries';

// Portafolio de propiedad intelectual (B40, ficha 17.16; RE-INN-001): marcas, registros de
// software y dominios, del vencimiento más próximo al más lejano, con su alerta de renovación.

const ASSET_STATUS_TONE = {
  proposed: 'info',
  filed: 'warning',
  registered: 'success',
  expired: 'destructive',
  abandoned: 'neutral',
} as const;

function expiry(asset: IpAsset): string {
  if (asset.expires_on === null) return asset.kind === 'software' ? 'No vence' : 'Sin vencimiento';
  const days = asset.days_to_expiry ?? 0;
  const left = days < 0 ? `venció hace ${String(-days)} días` : `faltan ${String(days)} días`;
  return `Vence el ${formatDate(asset.expires_on)} (${left})`;
}

export function AssetSummary({ asset }: { readonly asset: IpAsset }): JSX.Element {
  return (
    <span className="flex flex-col gap-1">
      <span>
        <strong>{asset.code}</strong> · {IP_KINDS[asset.kind]} · {asset.title}
      </span>
      <span className="text-muted-foreground">
        {asset.holder} · {asset.office}
        {asset.registry_number === null ? '' : ` · registro ${asset.registry_number}`}
        {asset.nice_classes === null ? '' : ` · clases ${asset.nice_classes}`}
      </span>
      <span className="text-muted-foreground">
        {expiry(asset)} · responsable {asset.responsible.name}
      </span>
      <span className="flex flex-wrap gap-2">
        <Badge tone={ASSET_STATUS_TONE[asset.status]}>{IP_STATUSES[asset.status]}</Badge>
        {asset.renewal_due ? <Badge tone="warning">Renovación por gestionar</Badge> : null}
        {asset.kind === 'software' && !asset.chain_complete ? (
          <Badge tone="destructive">Sin cesión de autores</Badge>
        ) : null}
      </span>
    </span>
  );
}

/** Descarga el portafolio RE-INN-001 en CSV; la descarga queda en la auditoría. */
function ExportPortfolio(): JSX.Element {
  const api = useApiClient();
  const action = useHrAction<undefined, DownloadedFile>(
    (_input, csrfToken) => api.download('/v1/innovation/ip-assets/export', { body: {}, csrfToken }),
    save,
  );
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={action.pending}
        onClick={() => {
          action.execute(undefined);
        }}
      >
        {action.pending ? 'Descargando…' : 'Descargar portafolio (CSV)'}
      </Button>
      <div aria-live="polite">
        {action.result === undefined ? null : (
          <FormSuccess message={`Descargamos ${action.result.fileName}.`} />
        )}
      </div>
      {action.error === null ? null : <FormError error={action.error} />}
    </div>
  );
}

export function InnovationPortfolio(): JSX.Element {
  const query = useInnQuery('/v1/innovation/ip-assets', ipAssetListResponseSchema);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Propiedad intelectual"
        description="Marcas, registros de software y dominios. Una marca avisa su renovación seis meses antes; un dominio, 60 días antes."
      />
      <div className="flex flex-wrap gap-3">
        <IpAssetForm />
        <ExportPortfolio />
      </div>
      <HrSection id="portafolio" title="Portafolio (RE-INN-001)">
        <QueryState query={query} loadingLabel="Cargando el portafolio">
          {({ data }) => (
            <HrList
              items={data}
              empty="Aún no hay activos en el portafolio."
              keyOf={(item) => item.id}
              render={(item) => (
                <>
                  <AssetSummary asset={item} />
                  <Link
                    className="underline"
                    href={`/app/innovacion/propiedad-intelectual/${item.id}`}
                    aria-label={`Ver ${item.code} y sus autores`}
                  >
                    Ver ficha y autores
                  </Link>
                </>
              )}
            />
          )}
        </QueryState>
      </HrSection>
    </div>
  );
}
