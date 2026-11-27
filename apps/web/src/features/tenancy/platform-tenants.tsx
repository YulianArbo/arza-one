'use client';

import type { PlatformTenant } from '@arza/contracts';
import { Badge, SimpleTable, TableCell, TableRow } from '@arza/ui';
import type { JSX } from 'react';

import { QueryState } from '../administration/query-state';
import { usePermissions } from '../session/permissions';
import { formatDate, limitLabel, PLAN_LABELS, STATUS_LABELS, storageLabel } from './labels';
import { usePlatformTenants } from './queries';
import { ConfirmStatusDialog, DeletionDialog, SuspendDialog } from './status-dialogs';
import { NewTenantDialog, PlanDialog } from './tenant-dialogs';

// Empresas de la plataforma (B48): el operador ve la ficha de cada una (plan, uso y estado), nunca
// su contenido, y desde aquí las da de alta, cambia su plan, las suspende o pide su eliminación.

const STATUS_TONES = {
  active: 'success',
  suspended: 'warning',
  closed: 'neutral',
} as const satisfies Record<PlatformTenant['status'], string>;

function StatusCell({ tenant }: { readonly tenant: PlatformTenant }): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <Badge tone={STATUS_TONES[tenant.status]}>{STATUS_LABELS[tenant.status]}</Badge>
      {tenant.deletion_due_on === null || tenant.status === 'closed' ? null : (
        <span className="text-xs text-destructive">
          Se elimina el {formatDate(tenant.deletion_due_on)}
        </span>
      )}
      {tenant.suspension_reason === null || tenant.status !== 'suspended' ? null : (
        <span className="text-xs text-muted-foreground">{tenant.suspension_reason}</span>
      )}
    </div>
  );
}

function UsageCell({ tenant }: { readonly tenant: PlatformTenant }): JSX.Element {
  if (tenant.usage === null) return <span className="text-muted-foreground">—</span>;
  const { usage, limits } = tenant;
  return (
    <ul className="text-sm">
      <li>
        Internos: {usage.internal_users} de {limitLabel(limits.max_internal_users)}
      </li>
      <li>
        Portal: {usage.portal_users} de {limitLabel(limits.max_portal_users)}
      </li>
      <li>
        Archivos: {storageLabel(usage.storage_mb)} de {storageLabel(limits.storage_mb)}
      </li>
    </ul>
  );
}

function Actions({ tenant }: { readonly tenant: PlatformTenant }): JSX.Element | null {
  const permissions = usePermissions();
  if (tenant.is_operator || tenant.status === 'closed') {
    return tenant.status === 'closed' ? null : <PlanDialog tenant={tenant} />;
  }
  const canDelete = permissions.can('platform.tenant.delete');
  const pendingDeletion = tenant.deletion_due_on !== null;
  return (
    <div className="flex flex-wrap gap-2">
      <PlanDialog tenant={tenant} />
      {tenant.status === 'active' ? <SuspendDialog tenant={tenant} /> : null}
      {tenant.status === 'suspended' && !pendingDeletion ? (
        <ConfirmStatusDialog tenant={tenant} kind="reactivate" />
      ) : null}
      {canDelete && tenant.status === 'suspended' && !pendingDeletion ? (
        <DeletionDialog tenant={tenant} />
      ) : null}
      {canDelete && pendingDeletion ? (
        <ConfirmStatusDialog tenant={tenant} kind="cancel_deletion" />
      ) : null}
    </div>
  );
}

function TenantRow({ tenant }: { readonly tenant: PlatformTenant }): JSX.Element {
  return (
    <TableRow>
      <TableCell>
        <p className="font-medium">{tenant.legal_name}</p>
        <p className="text-xs text-muted-foreground">
          NIT {tenant.tax_id}
          {tenant.is_operator ? ' · Opera la plataforma' : ''}
        </p>
      </TableCell>
      <TableCell>{PLAN_LABELS[tenant.plan]}</TableCell>
      <TableCell>
        <UsageCell tenant={tenant} />
      </TableCell>
      <TableCell>
        <StatusCell tenant={tenant} />
      </TableCell>
      <TableCell>
        {tenant.last_export_at === null ? 'Ninguna' : formatDate(tenant.last_export_at)}
      </TableCell>
      <TableCell>
        <Actions tenant={tenant} />
      </TableCell>
    </TableRow>
  );
}

const HEADERS = ['Empresa', 'Plan', 'Uso', 'Estado', 'Última exportación', ''];

/** Lista de empresas de la plataforma, para el operador. */
export function PlatformTenants(): JSX.Element {
  const tenants = usePlatformTenants();
  const canManage = usePermissions().can('platform.tenant.manage');
  return (
    <div className="flex flex-col gap-4">
      {canManage ? (
        <div>
          <NewTenantDialog />
        </div>
      ) : null}
      <QueryState query={tenants} loadingLabel="Cargando las empresas de la plataforma">
        {({ data }) => (
          <SimpleTable
            headers={HEADERS}
            caption="Empresas de la plataforma. Solo se ve su ficha, nunca su contenido."
            scrollLabel="Empresas de la plataforma"
          >
            {data.map((tenant) => (
              <TenantRow key={tenant.id} tenant={tenant} />
            ))}
          </SimpleTable>
        )}
      </QueryState>
    </div>
  );
}
