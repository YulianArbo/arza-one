'use client';

import { downloadLinkResponseSchema, ipAssetDetailSchema } from '@arza/contracts';
import { PageHeader } from '@arza/ui';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { QueryState } from '../administration/query-state';
import { HrActionButton } from '../hr/hr-dialog';
import { AssetSummary } from './innovation-portfolio';
import { IpAssetForm } from './ip-asset-form';
import { AuthorsSection } from './ip-authors';
import { useInnQuery } from './innovation-queries';

// Ficha de un activo de propiedad intelectual (B40): sus datos, su certificado y la cadena de
// titularidad con la cesión de cada autor (decisión 8).

function CertificateLink(props: { readonly id: string; readonly code: string }): JSX.Element {
  const api = useApiClient();
  return (
    <HrActionButton
      label="Descargar certificado"
      pendingLabel="Preparando…"
      ariaLabel={`Descargar el certificado de ${props.code}`}
      run={async (csrfToken) => {
        const link = await api.post(
          `/v1/innovation/ip-assets/${props.id}/certificate/download-link`,
          { body: {}, csrfToken, schema: downloadLinkResponseSchema },
        );
        window.open(link.url, '_self');
      }}
    />
  );
}

export function InnovationAssetDetail({ id }: { readonly id: string }): JSX.Element {
  const query = useInnQuery(`/v1/innovation/ip-assets/${id}`, ipAssetDetailSchema);
  return (
    <QueryState query={query} loadingLabel="Cargando el activo">
      {(asset) => (
        <div className="flex flex-col gap-8">
          <PageHeader title={`${asset.code} · ${asset.title}`} description={asset.notes ?? ''} />
          <AssetSummary asset={asset} />
          <div className="flex flex-wrap gap-3">
            <IpAssetForm asset={asset} />
            {asset.certificate === null ? null : (
              <CertificateLink id={asset.id} code={asset.code} />
            )}
          </div>
          <AuthorsSection asset={asset} />
        </div>
      )}
    </QueryState>
  );
}
