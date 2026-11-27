'use client';

import {
  TENANT_EXPORT_TTL_DAYS,
  tenantExportCreatedResponseSchema,
  type TenantExport,
} from '@arza/contracts';
import { Badge, Button, SimpleTable, TableCell, TableRow } from '@arza/ui';
import { Download, PackageOpen } from 'lucide-react';
import type { JSX } from 'react';

import type { DownloadedFile } from '../../lib/api/api-client';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { useAdminAction } from '../administration/admin-action';
import { QueryState } from '../administration/query-state';
import { save } from '../audit/audit-export-button';
import { usePermissions } from '../session/permissions';
import { EXPORT_STATUS_LABELS, formatDate, formatNumber, sizeLabel } from './labels';
import { TENANCY_KEYS, useTenantExports } from './queries';

// Exportación completa de la empresa (B48, decisiones 3 a 5): la pide y la descarga solo la
// Dirección, con su identidad confirmada. Se genera en unos minutos y queda disponible 7 días.

const EXPORT_REASON = 'Exportar todos los datos de la empresa queda en la auditoría.';

function RequestButton({ busy }: { readonly busy: boolean }): JSX.Element {
  const api = useApiClient();
  const action = useAdminAction<undefined, { id: string }>({
    run: (_input, csrfToken) =>
      api.post('/v1/tenant/exports', {
        body: {},
        schema: tenantExportCreatedResponseSchema,
        csrfToken,
      }),
    invalidate: [TENANCY_KEYS.exports],
    reason: EXPORT_REASON,
    successMessage: 'Pedimos la exportación. Estará lista en unos minutos.',
  });
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          type="button"
          disabled={busy || action.pending}
          onClick={() => {
            action.execute(undefined);
          }}
        >
          <PackageOpen aria-hidden="true" />
          {busy ? 'Hay una exportación en curso' : 'Generar exportación'}
        </Button>
      </div>
      {action.error === null ? null : <FormError error={action.error} />}
      {action.dialog}
    </div>
  );
}

function DownloadButton({ entry }: { readonly entry: TenantExport }): JSX.Element {
  const api = useApiClient();
  const action = useAdminAction<undefined, DownloadedFile>({
    run: (_input, csrfToken) =>
      api.download(`/v1/tenant/exports/${entry.id}/download`, { body: {}, csrfToken }),
    invalidate: [],
    reason: EXPORT_REASON,
    onSuccess: save,
    successMessage: null,
  });
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={action.pending}
        aria-label={`Descargar la exportación del ${formatDate(entry.requested_at)}`}
        onClick={() => {
          action.execute(undefined);
        }}
      >
        <Download aria-hidden="true" />
        {action.pending ? 'Descargando…' : 'Descargar'}
      </Button>
      {action.error === null ? null : <FormError error={action.error} />}
      {action.dialog}
    </div>
  );
}

function ExportRow({ entry }: { readonly entry: TenantExport }): JSX.Element {
  const contents =
    entry.rows === null
      ? '—'
      : `${formatNumber(entry.tables ?? 0)} tablas, ${formatNumber(entry.rows)} filas, ${formatNumber(entry.files ?? 0)} archivos`;
  return (
    <TableRow>
      <TableCell>{formatDate(entry.requested_at)}</TableCell>
      <TableCell>
        <Badge tone={EXPORT_TONES[entry.status]}>{EXPORT_STATUS_LABELS[entry.status]}</Badge>
      </TableCell>
      <TableCell>{contents}</TableCell>
      <TableCell>{entry.size_bytes === null ? '—' : sizeLabel(entry.size_bytes)}</TableCell>
      <TableCell>{entry.expires_at === null ? '—' : formatDate(entry.expires_at)}</TableCell>
      <TableCell>{entry.status === 'ready' ? <DownloadButton entry={entry} /> : null}</TableCell>
    </TableRow>
  );
}

const EXPORT_TONES = {
  queued: 'info',
  running: 'info',
  ready: 'success',
  failed: 'destructive',
  expired: 'neutral',
} as const satisfies Record<TenantExport['status'], string>;

const HEADERS = ['Pedida', 'Estado', 'Contenido', 'Tamaño', 'Disponible hasta', ''];

/** Exportaciones completas de la empresa, para la Dirección. */
export function TenantExportsPanel(): JSX.Element {
  const exports = useTenantExports();
  return (
    <section aria-labelledby="exportacion-titulo" className="flex flex-col gap-4">
      <div>
        <h2 id="exportacion-titulo" className="text-lg font-semibold">
          Exportación completa de la empresa
        </h2>
        <p className="text-sm text-muted-foreground">
          Un archivo ZIP con todos los datos de la empresa en hojas de Excel (CSV), sus archivos
          originales y un índice para comprobar que está completo. No incluye contraseñas ni códigos
          de acceso. Queda disponible {TENANT_EXPORT_TTL_DAYS} días.
        </p>
      </div>
      <QueryState query={exports} loadingLabel="Cargando las exportaciones">
        {({ data }) => (
          <div className="flex flex-col gap-4">
            <RequestButton
              busy={data.some((entry) => entry.status === 'queued' || entry.status === 'running')}
            />
            {data.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay exportaciones.</p>
            ) : (
              <SimpleTable headers={HEADERS} caption="Exportaciones de la empresa">
                {data.map((entry) => (
                  <ExportRow key={entry.id} entry={entry} />
                ))}
              </SimpleTable>
            )}
          </div>
        )}
      </QueryState>
    </section>
  );
}

/** La sección solo existe para quien puede exportar (la Dirección). */
export function TenantExportsSection(): JSX.Element | null {
  return usePermissions().can('core.tenant.export') ? <TenantExportsPanel /> : null;
}
