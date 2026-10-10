'use client';

import { Button } from '@arza/ui';
import { Download } from 'lucide-react';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import type { DownloadedFile } from '../../lib/api/api-client';
import { FormError, FormSuccess } from '../access/form-alert';
import { useAdminAction } from '../administration/admin-action';
import { usePermissions } from '../session/permissions';
import { AUDIT_KEYS, type AuditFilters } from './queries';

/** Entrega el archivo al navegador para que la persona lo guarde. */
function save(file: DownloadedFile): void {
  const url = URL.createObjectURL(file.content);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function usedFilters(filters: AuditFilters): Record<string, string> {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''));
}

/**
 * Exportar a CSV los eventos con los filtros de la pantalla (audit.event.export, solo el auditor).
 * Pide confirmar la identidad y queda registrado en Exportaciones y en la auditoría.
 */
export function AuditExportButton({
  filters,
}: {
  readonly filters: AuditFilters;
}): JSX.Element | null {
  const api = useApiClient();
  const permissions = usePermissions();
  const action = useAdminAction<AuditFilters, DownloadedFile>({
    run: (current, csrfToken) =>
      api.download('/v1/audit-exports', { body: usedFilters(current), csrfToken }),
    invalidate: [AUDIT_KEYS.exports],
    reason: 'Exportar la auditoría entrega información sensible de la empresa.',
    onSuccess: save,
  });
  if (!permissions.can('audit.event.export')) return null;
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={action.pending}
        onClick={() => {
          action.execute(filters);
        }}
      >
        <Download aria-hidden="true" />
        {action.pending ? 'Exportando…' : 'Exportar a CSV'}
      </Button>
      <div aria-live="polite">
        {action.result === undefined ? null : (
          <FormSuccess message={`Descargamos el archivo ${action.result.fileName}.`} />
        )}
      </div>
      {action.error === null ? null : <FormError error={action.error} />}
      {action.dialog}
    </div>
  );
}
