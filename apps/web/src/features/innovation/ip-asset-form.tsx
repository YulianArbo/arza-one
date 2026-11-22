'use client';

import {
  IP_KINDS,
  IP_STATUSES,
  innCodeResponseSchema,
  saveIpAssetSchema,
  type IpAsset,
} from '@arza/contracts';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { HrDialogForm, optionsOf, orNull } from '../hr/hr-dialog';
import type { HrField } from '../hr/hr-form';
import { usePermissions } from '../session/permissions';
import { INN_REFRESH, useInnPeople, type Option } from './innovation-queries';

// Registrar o actualizar un activo del portafolio (B40; RE-INN-001, FT-INN-001, FT-INN-002). Al
// renovar, basta con escribir el nuevo vencimiento: la alerta se vuelve a programar sola.

function identityFields(people: Option[], asset?: IpAsset): HrField[] {
  return [
    { key: 'kind', label: 'Tipo', options: optionsOf(IP_KINDS), value: asset?.kind ?? '' },
    {
      key: 'title',
      label: 'Nombre de la marca, del software o del dominio',
      value: asset?.title ?? '',
    },
    { key: 'holder', label: 'Titular', value: asset?.holder ?? '' },
    {
      key: 'responsible_id',
      label: 'Responsable',
      options: people,
      value: asset?.responsible.id ?? '',
    },
    {
      key: 'status',
      label: 'Estado',
      options: optionsOf(IP_STATUSES),
      value: asset?.status ?? 'proposed',
    },
    {
      key: 'office',
      label: 'Entidad (vacío: la que corresponde al tipo)',
      value: asset?.office ?? '',
    },
  ];
}

function registryFields(asset?: IpAsset): HrField[] {
  return [
    {
      key: 'registry_number',
      label: 'Número de registro (opcional)',
      value: asset?.registry_number ?? '',
    },
    {
      key: 'nice_classes',
      label: 'Clases de Niza, solo marcas (opcional)',
      value: asset?.nice_classes ?? '',
    },
    { key: 'filed_on', label: 'Fecha de radicación', type: 'date', value: asset?.filed_on ?? '' },
    {
      key: 'granted_on',
      label: 'Fecha de concesión',
      type: 'date',
      value: asset?.granted_on ?? '',
    },
    {
      key: 'expires_on',
      label: 'Vencimiento (el software no vence)',
      type: 'date',
      value: asset?.expires_on ?? '',
    },
    { key: 'product', label: 'Producto (opcional)', value: asset?.product ?? '' },
    { key: 'version_label', label: 'Versión (opcional)', value: asset?.version_label ?? '' },
    { key: 'notes', label: 'Notas (opcional)', value: asset?.notes ?? '' },
  ];
}

const OPTIONAL = [
  'registry_number',
  'nice_classes',
  'office',
  'filed_on',
  'granted_on',
  'expires_on',
  'product',
  'version_label',
  'notes',
] as const;

export function assetBody(
  values: Record<string, string>,
  certificate: string | null,
): Record<string, unknown> {
  const optional = Object.fromEntries(OPTIONAL.map((key) => [key, orNull(values[key])]));
  return { ...values, ...optional, certificate_file_id: certificate };
}

export function IpAssetForm({ asset }: { readonly asset?: IpAsset }): JSX.Element | null {
  const api = useApiClient();
  const { canAll } = usePermissions();
  const allowed = canAll('inn.ip.manage');
  const people = useInnPeople(allowed);
  const editing = asset !== undefined;
  return (
    <HrDialogForm
      allowed={allowed}
      label={editing ? 'Actualizar' : 'Registrar activo'}
      title={editing ? `Actualizar ${asset.code}` : 'Registrar una marca, un software o un dominio'}
      description="Un registro de software no pasa a radicado ni vigente sin la cesión escrita de todos sus autores."
      fields={[...identityFields(people, asset), ...registryFields(asset)]}
      schema={saveIpAssetSchema}
      prepare={(values) => assetBody(values, asset?.certificate?.id ?? null)}
      run={(body, csrfToken) =>
        editing
          ? api.patch(`/v1/innovation/ip-assets/${asset.id}`, {
              body,
              csrfToken,
              version: asset.version,
            })
          : api.post('/v1/innovation/ip-assets', { body, csrfToken, schema: innCodeResponseSchema })
      }
      submitLabel={editing ? 'Guardar' : 'Registrar'}
      refresh={INN_REFRESH}
    />
  );
}

/** Los valores actuales del activo como cuerpo de la actualización, con otro certificado. */
export function assetAsBody(asset: IpAsset, certificate: string | null): object {
  return {
    kind: asset.kind,
    title: asset.title,
    holder: asset.holder,
    registry_number: asset.registry_number,
    nice_classes: asset.nice_classes,
    office: asset.office,
    filed_on: asset.filed_on,
    granted_on: asset.granted_on,
    expires_on: asset.expires_on,
    status: asset.status,
    responsible_id: asset.responsible.id,
    product: asset.product,
    version_label: asset.version_label,
    certificate_file_id: certificate,
    notes: asset.notes,
  };
}
