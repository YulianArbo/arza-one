'use client';

import { TENANT_DELETION_GRACE_DAYS, type PlatformTenant } from '@arza/contracts';
import { Alert, AlertDescription, Button, FormField, TextareaField } from '@arza/ui';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { useAdminAction } from '../administration/admin-action';
import { formatDate } from './labels';
import { TENANCY_KEYS } from './queries';
import { FormDialog } from './tenant-dialogs';

// Suspensión, reactivación y eliminación de una empresa (B48). Todas piden un motivo o una
// confirmación y quedan en la auditoría de las dos empresas.

const REASON = 'Esta acción cambia el acceso de una empresa a la plataforma.';

type StatusPath = 'suspend' | 'reactivate' | 'deletion';

function useStatusChange(
  tenant: PlatformTenant,
  options: { path: StatusPath; method: 'post' | 'delete'; message: string; onDone: () => void },
) {
  const api = useApiClient();
  return useAdminAction<object | undefined, unknown>({
    run: (body, csrfToken) => {
      const path = `/v1/platform/tenants/${tenant.id}/${options.path}`;
      if (options.method === 'delete')
        return api.delete(path, { version: tenant.version, csrfToken });
      return api.post(path, { body: body ?? {}, version: tenant.version, csrfToken });
    },
    invalidate: [TENANCY_KEYS.tenants],
    reason: REASON,
    successMessage: options.message,
    onSuccess: options.onDone,
  });
}

function trigger(label: string, destructive = false): JSX.Element {
  return (
    <Button type="button" variant={destructive ? 'destructive' : 'outline'} size="sm">
      {label}
    </Button>
  );
}

/** Suspender: nadie de la empresa entra y se cierran sus sesiones. Sus datos quedan intactos. */
export function SuspendDialog({ tenant }: { readonly tenant: PlatformTenant }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const close = (): void => {
    setOpen(false);
  };
  const action = useStatusChange(tenant, {
    path: 'suspend',
    method: 'post',
    message: 'La empresa quedó suspendida y se cerraron sus sesiones.',
    onDone: close,
  });
  return (
    <FormDialog
      trigger={trigger('Suspender')}
      title={`Suspender ${tenant.legal_name}`}
      description="Nadie de la empresa podrá entrar, se cierran sus sesiones y se detienen sus tareas automáticas. Sus datos quedan intactos y puede reactivarla."
      submitLabel="Suspender la empresa"
      pending={action.pending}
      error={action.error}
      open={open}
      onOpenChange={setOpen}
      onSubmit={() => {
        action.execute({ reason: reason.trim() });
      }}
    >
      <TextareaField
        id={`suspension-${tenant.id}`}
        label="Motivo"
        hint="Entre 10 y 500 caracteres; queda en la auditoría."
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
        }}
      />
      {action.dialog}
    </FormDialog>
  );
}

/** Confirmación simple para reactivar o cancelar la eliminación. */
export function ConfirmStatusDialog(props: {
  readonly tenant: PlatformTenant;
  readonly kind: 'reactivate' | 'cancel_deletion';
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const reactivate = props.kind === 'reactivate';
  const action = useStatusChange(props.tenant, {
    path: reactivate ? 'reactivate' : 'deletion',
    method: reactivate ? 'post' : 'delete',
    message: reactivate ? 'La empresa quedó activa.' : 'La eliminación quedó cancelada.',
    onDone: () => {
      setOpen(false);
    },
  });
  return (
    <FormDialog
      trigger={trigger(reactivate ? 'Reactivar' : 'Cancelar eliminación')}
      title={reactivate ? `Reactivar ${props.tenant.legal_name}` : 'Cancelar la eliminación'}
      description={
        reactivate
          ? 'Las personas de la empresa podrán volver a entrar.'
          : 'Los datos no se borrarán. La empresa sigue suspendida hasta que la reactive.'
      }
      submitLabel={reactivate ? 'Reactivar la empresa' : 'Cancelar la eliminación'}
      pending={action.pending}
      error={action.error}
      open={open}
      onOpenChange={setOpen}
      onSubmit={() => {
        action.execute(undefined);
      }}
    >
      {action.dialog}
    </FormDialog>
  );
}

function DeletionFields(props: {
  readonly tenant: PlatformTenant;
  readonly reason: string;
  readonly taxId: string;
  readonly onReason: (value: string) => void;
  readonly onTaxId: (value: string) => void;
}): JSX.Element {
  const { tenant } = props;
  const exported = tenant.last_export_at === null ? null : formatDate(tenant.last_export_at);
  return (
    <>
      <Alert tone={exported === null ? 'destructive' : 'info'}>
        <AlertDescription>
          {exported === null
            ? 'La empresa no tiene exportación. Antes, su Dirección debe generarla desde «Empresa y sedes».'
            : `Última exportación lista: ${exported}. Debe ser de los últimos 30 días.`}
        </AlertDescription>
      </Alert>
      <TextareaField
        id={`eliminacion-motivo-${tenant.id}`}
        label="Motivo"
        value={props.reason}
        onChange={(event) => {
          props.onReason(event.target.value);
        }}
      />
      <FormField
        id={`eliminacion-nit-${tenant.id}`}
        label={`Escriba el NIT ${tenant.tax_id} para confirmar`}
        value={props.taxId}
        onChange={(event) => {
          props.onTaxId(event.target.value);
        }}
      />
    </>
  );
}

/** Pedir la eliminación: exige el NIT escrito y una exportación reciente. */
export function DeletionDialog({ tenant }: { readonly tenant: PlatformTenant }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [taxId, setTaxId] = useState('');
  const action = useStatusChange(tenant, {
    path: 'deletion',
    method: 'post',
    message: `La eliminación quedó programada para dentro de ${String(TENANT_DELETION_GRACE_DAYS)} días.`,
    onDone: () => {
      setOpen(false);
    },
  });
  return (
    <FormDialog
      trigger={trigger('Pedir eliminación', true)}
      title={`Eliminar ${tenant.legal_name}`}
      description={`Dentro de ${String(TENANT_DELETION_GRACE_DAYS)} días se borran todos sus datos y archivos; no se puede deshacer. Hasta esa fecha puede cancelarla.`}
      submitLabel="Pedir la eliminación"
      pending={action.pending}
      error={action.error}
      open={open}
      onOpenChange={setOpen}
      onSubmit={() => {
        action.execute({ reason: reason.trim(), confirm_tax_id: taxId.trim() });
      }}
    >
      <DeletionFields
        tenant={tenant}
        reason={reason}
        taxId={taxId}
        onReason={setReason}
        onTaxId={setTaxId}
      />
      {action.dialog}
    </FormDialog>
  );
}
