'use client';

import {
  EDITABLE_ROADMAP_STATUSES,
  ROADMAP_STATUSES,
  ideaListResponseSchema,
  innCreatedResponseSchema,
  releaseRoadmapItemSchema,
  roadmapListResponseSchema,
  saveRoadmapItemSchema,
  type RoadmapItem,
} from '@arza/contracts';
import { Badge, PageHeader } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { HrDialogForm, HrList, HrSection, optionsOf, orNull } from '../hr/hr-dialog';
import type { HrField } from '../hr/hr-form';
import { usePermissions } from '../session/permissions';
import {
  INN_REFRESH,
  bogotaToday,
  useInnPeople,
  useInnQuery,
  type Option,
} from './innovation-queries';

// Hoja de ruta de productos propios (B40, ficha 17.16; FT-INN-004). Al liberar una versión, la
// plataforma propone su registro ante la Dirección Nacional de Derecho de Autor y le da la tarea de
// radicarlo al responsable del hito (decisión 7).

const STATUS_TONE = {
  planned: 'neutral',
  in_progress: 'info',
  released: 'success',
  cancelled: 'warning',
} as const;

/** Ideas aprobadas, en desarrollo o implementadas: las que pueden originar un hito. */
function useApprovedIdeas(enabled: boolean): Option[] {
  const query = useInnQuery('/v1/innovation/ideas', ideaListResponseSchema, enabled);
  return (query.data?.data ?? [])
    .filter((idea) => ['approved', 'in_development', 'implemented'].includes(idea.stage))
    .map((idea) => ({ value: idea.id, label: `${idea.code} · ${idea.title}` }));
}

function itemFields(
  lists: { readonly people: Option[]; readonly ideas: Option[]; readonly products: string[] },
  item?: RoadmapItem,
): HrField[] {
  const known = lists.products.length === 0 ? '' : ` (ya escritos: ${lists.products.join(', ')})`;
  return [
    { key: 'product', label: `Producto${known}`, value: item?.product ?? '' },
    { key: 'title', label: 'Hito o funcionalidad', value: item?.title ?? '' },
    { key: 'description', label: 'Descripción (opcional)', value: item?.description ?? '' },
    { key: 'quarter', label: 'Trimestre, como 2027-T1', value: item?.quarter ?? '' },
    {
      key: 'status',
      label: 'Estado',
      options: optionsOf(EDITABLE_ROADMAP_STATUSES),
      value: item?.status ?? 'planned',
    },
    { key: 'owner_id', label: 'Responsable', options: lists.people, value: item?.owner.id ?? '' },
    {
      key: 'idea_id',
      label: 'Idea aprobada de la que nace (opcional)',
      options: lists.ideas,
      value: item?.idea?.id ?? '',
    },
  ];
}

function itemBody(values: Record<string, string>) {
  return {
    ...values,
    description: orNull(values['description']),
    idea_id: orNull(values['idea_id']),
  };
}

function ItemForm(props: { readonly item?: RoadmapItem; readonly products: string[] }) {
  const api = useApiClient();
  const { canAll } = usePermissions();
  const allowed = canAll('inn.roadmap.manage') && props.item?.status !== 'released';
  const people = useInnPeople(allowed);
  const ideas = useApprovedIdeas(allowed);
  const item = props.item;
  return (
    <HrDialogForm
      allowed={allowed}
      label={item === undefined ? 'Agregar hito' : 'Actualizar'}
      title={
        item === undefined ? 'Agregar un hito a la hoja de ruta' : `Actualizar «${item.title}»`
      }
      description="El producto es un texto libre: escríbalo igual que en los demás hitos."
      fields={itemFields({ people, ideas, products: props.products }, item)}
      schema={saveRoadmapItemSchema}
      prepare={itemBody}
      run={(body, csrfToken) =>
        item === undefined
          ? api.post('/v1/innovation/roadmap', {
              body,
              csrfToken,
              schema: innCreatedResponseSchema,
            })
          : api.patch(`/v1/innovation/roadmap/${item.id}`, {
              body,
              csrfToken,
              version: item.version,
            })
      }
      submitLabel={item === undefined ? 'Agregar' : 'Guardar'}
      refresh={INN_REFRESH}
    />
  );
}

function ReleaseForm({ item }: { readonly item: RoadmapItem }): JSX.Element | null {
  const api = useApiClient();
  const { canAll } = usePermissions();
  const open = item.status === 'planned' || item.status === 'in_progress';
  return (
    <HrDialogForm
      allowed={canAll('inn.roadmap.manage') && open}
      label="Liberar versión"
      title={`Liberar una versión de ${item.product}`}
      description="La plataforma propondrá el registro del software ante la Dirección Nacional de Derecho de Autor y le dará la tarea de radicarlo al responsable del hito."
      fields={[
        { key: 'version_label', label: 'Versión liberada, como 1.2.0' },
        { key: 'released_on', label: 'Fecha de la liberación', type: 'date', value: bogotaToday() },
      ]}
      schema={releaseRoadmapItemSchema}
      run={(body, csrfToken) =>
        api.post(`/v1/innovation/roadmap/${item.id}/release`, {
          body,
          csrfToken,
          version: item.version,
        })
      }
      submitLabel="Liberar"
      refresh={INN_REFRESH}
    />
  );
}

function ItemRow(props: { readonly item: RoadmapItem; readonly products: string[] }) {
  const { item } = props;
  return (
    <>
      <span className="flex flex-col gap-1">
        <span>
          <strong>{item.quarter}</strong> · {item.product} · {item.title}
        </span>
        {item.description === null ? null : <span>{item.description}</span>}
        <span className="text-muted-foreground">
          Responsable: {item.owner.name}
          {item.idea === null ? '' : ` · nace de ${item.idea.code}`}
          {item.released_on === null
            ? ''
            : ` · versión ${item.version_label ?? ''} liberada el ${formatDate(item.released_on)}`}
        </span>
        {item.ip_asset === null ? null : (
          <Link
            className="underline"
            href={`/app/innovacion/propiedad-intelectual/${item.ip_asset.id}`}
          >
            Registro propuesto {item.ip_asset.code}
          </Link>
        )}
        <Badge tone={STATUS_TONE[item.status]}>{ROADMAP_STATUSES[item.status]}</Badge>
      </span>
      <span className="flex flex-wrap gap-2">
        <ItemForm item={item} products={props.products} />
        <ReleaseForm item={item} />
      </span>
    </>
  );
}

export function InnovationRoadmap(): JSX.Element {
  const query = useInnQuery('/v1/innovation/roadmap', roadmapListResponseSchema);
  const products = query.data?.products ?? [];
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Hoja de ruta de productos propios"
        description="Hitos por trimestre y producto. Cada versión liberada propone su registro ante Derecho de Autor."
      />
      <div>
        <ItemForm products={products} />
      </div>
      <HrSection id="hoja-de-ruta" title="Hitos por trimestre">
        <QueryState query={query} loadingLabel="Cargando la hoja de ruta">
          {({ data }) => (
            <HrList
              items={data}
              empty="Aún no hay hitos en la hoja de ruta."
              keyOf={(item) => item.id}
              render={(item) => <ItemRow item={item} products={products} />}
            />
          )}
        </QueryState>
      </HrSection>
    </div>
  );
}
