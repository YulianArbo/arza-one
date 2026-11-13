'use client';

import {
  ASSET_CATEGORIES,
  ASSET_STATUS,
  ASSIGNMENT_STATUS,
  assetListResponseSchema,
  type Asset,
} from '@arza/contracts';
import { Badge, Button, EmptyState, SimpleTable } from '@arza/ui';
import { Download, Laptop } from 'lucide-react';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import type { DownloadedFile } from '../../lib/api/api-client';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { FormError, FormSuccess } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { save } from '../audit/audit-export-button';
import { formatPesos } from '../crm/labels';
import { NewRecord } from '../finance/ledger-ui';
import { RecordDialog } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { AssetHistory } from './asset-history';
import {
  AssetForm,
  AssignForm,
  CancelAssignmentForm,
  RetireForm,
  ReturnForm,
  ScheduleMaintenanceForm,
} from './asset-forms';
import { useAssetAction, useAssetQuery } from './asset-ui';

// Inventario y libro de activos (B34, RE-ADM-003). Quien administra ve todo el inventario, asigna
// en comodato, registra devoluciones y bajas, y descarga el libro; un colaborador ve solo los
// activos que tiene a su cargo.

const DESCRIPTIONS = {
  all: 'Inventario de activos fijos y licencias con su responsable, su comodato y su depreciación informativa. Un activo solo queda asignado cuando el colaborador firma el comodato.',
  mine: 'Activos que usted tiene a su cargo o está por recibir, con su contrato de comodato.',
};

export function AssetsPanel(): JSX.Element {
  const { can, canAll } = usePermissions();
  const manages = can('asset.manage');
  const all = canAll('asset.read');
  const assets = useAssetQuery('/v1/assets', assetListResponseSchema);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={all ? 'Activos' : 'Mis activos'}
        description={all ? DESCRIPTIONS.all : DESCRIPTIONS.mine}
      />
      <div className="flex flex-wrap items-start gap-3">
        <NewRecord
          allowed={manages}
          label="Registrar activo"
          title="Registrar activo"
          description="Queda disponible para asignarlo en comodato."
        >
          {(close) => <AssetForm onDone={close} />}
        </NewRecord>
        {all ? <BookButton /> : null}
      </div>
      <QueryState query={assets} loadingLabel="Cargando activos">
        {(result) =>
          result.data.length === 0 ? (
            <EmptyState
              icon={<Laptop />}
              title="Aún no hay activos"
              description="Los activos aparecerán aquí con su estado y su responsable."
            />
          ) : (
            <AssetTable assets={result.data} />
          )
        }
      </QueryState>
    </div>
  );
}

/** Descarga del libro de activos; solo para quien ve todo el inventario. */
function BookButton(): JSX.Element {
  const api = useApiClient();
  const action = useAssetAction<undefined, DownloadedFile>(
    (_args, csrfToken) => api.download('/v1/assets/book/export', { body: {}, csrfToken }),
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
        <Download aria-hidden="true" />
        {action.pending ? 'Descargando…' : 'Descargar libro de activos'}
      </Button>
      <div aria-live="polite">
        {action.result === undefined ? null : (
          <FormSuccess message={`Descargamos ${action.result.fileName}.`} />
        )}
      </div>
      {action.error === null ? null : <FormError error={action.error} />}
      {action.dialog}
    </div>
  );
}

const HEADERS = ['Código', 'Activo', 'Compra', 'Valor en libros', 'Estado', 'Responsable', ''];

function AssetTable({ assets }: { readonly assets: readonly Asset[] }): JSX.Element {
  return (
    <SimpleTable headers={HEADERS} caption="Activos">
      {assets.map((asset) => (
        <tr key={asset.id}>
          <td className="p-2 font-medium">{asset.code}</td>
          <td className="p-2">
            {asset.name}
            <span className="block text-xs text-muted-foreground">
              {ASSET_CATEGORIES[asset.category]}
              {asset.serial === null ? '' : ` · Serie ${asset.serial}`}
            </span>
          </td>
          <td className="p-2">
            {formatDate(asset.purchase_date)}
            <span className="block text-xs text-muted-foreground">{formatPesos(asset.cost)}</span>
          </td>
          <td className="p-2">{formatPesos(asset.book_value)}</td>
          <td className="p-2">
            <AssetState asset={asset} />
          </td>
          <td className="p-2">{asset.assignment?.holder.name ?? '—'}</td>
          <td className="p-2">
            <AssetActions asset={asset} />
          </td>
        </tr>
      ))}
    </SimpleTable>
  );
}

function AssetState({ asset }: { readonly asset: Asset }): JSX.Element {
  const { assignment } = asset;
  return (
    <>
      <Badge>{ASSET_STATUS[asset.status]}</Badge>
      {assignment === null ? null : (
        <span className="block text-xs text-muted-foreground">
          {assignment.status === 'active'
            ? `Comodato ${assignment.record_code ?? ''} firmado`
            : `${ASSIGNMENT_STATUS[assignment.status]} · firma hasta el ${formatDate(assignment.sign_by)}`}
        </span>
      )}
      {asset.retired_on === null ? null : (
        <span className="block text-xs text-muted-foreground">
          Baja del {formatDate(asset.retired_on)}
        </span>
      )}
    </>
  );
}

/** Textos del diálogo de una acción sobre el activo, con su código en el nombre del botón. */
function dialogOf(asset: Asset, label: string, title: string, description: string) {
  return {
    triggerLabel: label,
    triggerAriaLabel: `${label} ${asset.code}`,
    title: `${title} ${asset.code}`,
    description,
    variant: 'outline' as const,
  };
}

function AssetActions({ asset }: { readonly asset: Asset }): JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      <AssignmentActions asset={asset} />
      <ManageActions asset={asset} />
      <RecordDialog
        {...dialogOf(asset, 'Ver historial', 'Historial de', 'Asignaciones y mantenimientos.')}
      >
        {() => <AssetHistory assetId={asset.id} />}
      </RecordDialog>
    </div>
  );
}

/** Asignar, anular antes de la firma o registrar la devolución, según el estado. */
function AssignmentActions({ asset }: { readonly asset: Asset }): JSX.Element | null {
  const { can } = usePermissions();
  const { assignment } = asset;
  if (!can('asset.assign')) return null;
  if (asset.status === 'available') {
    const text = 'El comodato sale a firma del colaborador por correo.';
    return (
      <RecordDialog {...dialogOf(asset, 'Asignar', 'Asignar', text)}>
        {(close) => <AssignForm asset={asset} onDone={close} />}
      </RecordDialog>
    );
  }
  if (assignment === null) return null;
  const free = 'El activo vuelve a quedar disponible.';
  if (asset.status === 'reserved') {
    return (
      <RecordDialog {...dialogOf(asset, 'Anular asignación', 'Anular la asignación de', free)}>
        {(close) => <CancelAssignmentForm assignment={assignment} onDone={close} />}
      </RecordDialog>
    );
  }
  return (
    <RecordDialog {...dialogOf(asset, 'Registrar devolución', 'Devolución de', free)}>
      {(close) => <ReturnForm assignment={assignment} onDone={close} />}
    </RecordDialog>
  );
}

/** Programar mantenimiento y dar de baja. */
function ManageActions({ asset }: { readonly asset: Asset }): JSX.Element {
  const { can } = usePermissions();
  const maintain = 'Preventivo o correctivo.';
  return (
    <>
      {asset.status !== 'retired' && can('asset.manage') ? (
        <RecordDialog {...dialogOf(asset, 'Programar mantenimiento', 'Mantenimiento de', maintain)}>
          {(close) => <ScheduleMaintenanceForm asset={asset} onDone={close} />}
        </RecordDialog>
      ) : null}
      {asset.status === 'available' && can('asset.retire') ? (
        <RecordDialog {...dialogOf(asset, 'Dar de baja', 'Dar de baja', 'La baja no se deshace.')}>
          {(close) => <RetireForm asset={asset} onDone={close} />}
        </RecordDialog>
      ) : null}
    </>
  );
}
