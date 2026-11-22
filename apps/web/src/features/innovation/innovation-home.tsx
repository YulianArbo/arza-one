'use client';

import { ideaListResponseSchema, ipAssetListResponseSchema } from '@arza/contracts';
import { PageHeader, QuickLinks, StatCard } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { QueryState } from '../administration/query-state';
import { HrList, HrSection } from '../hr/hr-dialog';
import { usePermissions } from '../session/permissions';
import { IdeaForm, IdeaSummary } from './innovation-ideas';
import { useInnQuery } from './innovation-queries';

// Portada de Innovación (B40): todo colaborador propone ideas y ve las suyas; quien lee Innovación
// ve además lo que requiere atención y entra a cada parte del módulo.

const INNOVATION_LINKS = [
  { href: '/app/innovacion/ideas', label: 'Banco de ideas' },
  { href: '/app/innovacion/hoja-de-ruta', label: 'Hoja de ruta de productos' },
  { href: '/app/innovacion/propiedad-intelectual', label: 'Propiedad intelectual' },
  { href: '/app/innovacion/vigilancia', label: 'Vigilancia y competencia' },
] as const;

function Indicators(): JSX.Element {
  const ideas = useInnQuery('/v1/innovation/ideas', ideaListResponseSchema);
  const assets = useInnQuery('/v1/innovation/ip-assets', ipAssetListResponseSchema);
  const wait = (ready: boolean, value: number) => (ready ? String(value) : '…');
  const ideaList = ideas.data?.data ?? [];
  const assetList = assets.data?.data ?? [];
  const count = (stage: string) => ideaList.filter((idea) => idea.stage === stage).length;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Ideas inscritas" value={wait(ideas.isSuccess, count('registered'))} />
      <StatCard label="Ideas en evaluación" value={wait(ideas.isSuccess, count('evaluating'))} />
      <StatCard
        label="Activos por renovar"
        value={wait(assets.isSuccess, assetList.filter((asset) => asset.renewal_due).length)}
        note="Marcas a 6 meses y dominios a 60 días"
      />
      <StatCard
        label="Registros propuestos"
        value={wait(
          assets.isSuccess,
          assetList.filter((asset) => asset.status === 'proposed').length,
        )}
        note="Por radicar ante Derecho de Autor"
      />
    </div>
  );
}

function MyIdeas(): JSX.Element {
  const query = useInnQuery('/v1/innovation/my/ideas', ideaListResponseSchema);
  return (
    <HrSection id="mis-ideas" title="Ideas que propuse">
      <QueryState query={query} loadingLabel="Cargando sus ideas">
        {({ data }) => (
          <HrList
            items={data}
            empty="Aún no ha propuesto ideas."
            keyOf={(item) => item.id}
            render={(item) => (
              <>
                <IdeaSummary idea={item} />
                <IdeaForm idea={item} />
              </>
            )}
          />
        )}
      </QueryState>
    </HrSection>
  );
}

export function InnovationHome(): JSX.Element {
  const { can, canAll } = usePermissions();
  const reads = canAll('inn.read');
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Innovación y propiedad intelectual"
        description="Banco de ideas, hoja de ruta de productos propios, portafolio de marcas, software y dominios, y vigilancia tecnológica."
      />
      <div>
        <IdeaForm />
      </div>
      {reads ? <Indicators /> : null}
      {reads ? (
        <QuickLinks title="Partes del módulo" links={INNOVATION_LINKS} linkAs={Link} />
      ) : null}
      {can('inn.idea.create') ? <MyIdeas /> : null}
    </div>
  );
}
