'use client';

import type { AccessReviewResponse } from '@arza/contracts';
import { Badge, Button, SimpleTable, TableCell, TableRow } from '@arza/ui';
import { Download, Printer } from 'lucide-react';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import type { DownloadedFile } from '../../lib/api/api-client';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError, FormSuccess } from '../access/form-alert';
import { save } from '../audit/audit-export-button';
import { useAdminAction } from './admin-action';
import { USER_KIND_LABELS, USER_STATUS_LABELS, personName } from './labels';
import { useAccessReview } from './queries';
import { QueryState } from './query-state';

function Totals({ report }: { readonly report: AccessReviewResponse }): JSX.Element {
  const items = [
    { label: 'Cuentas', value: report.totals.users },
    { label: 'Activas', value: report.totals.active },
    { label: `Sin uso en ${String(report.unused_days)} días`, value: report.totals.unused },
    { label: 'Sin roles', value: report.totals.without_roles },
    { label: 'Internas sin segundo factor', value: report.totals.without_second_factor },
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border bg-card p-4 shadow-sm">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="font-heading text-2xl font-bold">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

type ReviewUser = AccessReviewResponse['users'][number];

function ReviewRow({ user }: { readonly user: ReviewUser }): JSX.Element {
  return (
    <TableRow>
      <TableCell>
        <p className="font-medium">{personName(user)}</p>
        <p className="text-xs text-muted-foreground">{user.email}</p>
      </TableCell>
      <TableCell>{USER_KIND_LABELS[user.kind]}</TableCell>
      <TableCell>{USER_STATUS_LABELS[user.status]}</TableCell>
      <TableCell>{user.roles.map((role) => role.name).join(', ') || 'Sin roles'}</TableCell>
      <TableCell>
        {user.second_factor ? (
          <Badge tone="success">Activo</Badge>
        ) : (
          <Badge tone="warning">Sin configurar</Badge>
        )}
      </TableCell>
      <TableCell>
        {formatDateTime(user.last_login_at)}{' '}
        {user.unused ? <Badge tone="warning">Sin uso</Badge> : null}
      </TableCell>
    </TableRow>
  );
}

const HEADERS = ['Persona', 'Tipo', 'Estado', 'Roles vigentes', 'Segundo factor', 'Último ingreso'];
const CAPTION =
  'Revise que cada persona tenga solo los roles que necesita y retire las cuentas sin uso.';

/** Descarga el mismo informe en CSV para Excel; la descarga queda en la auditoría (B45). */
function DownloadButton(): JSX.Element {
  const api = useApiClient();
  const action = useAdminAction<undefined, DownloadedFile>({
    run: (_input, csrfToken) => api.download('/v1/access-review/export', { body: {}, csrfToken }),
    invalidate: [],
    reason: 'Descargar el informe de revisión de accesos queda en la auditoría.',
    onSuccess: save,
  });
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={action.pending}
        onClick={() => {
          action.execute(undefined);
        }}
      >
        <Download aria-hidden="true" />
        {action.pending ? 'Descargando…' : 'Descargar CSV'}
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

function Report({ report }: { readonly report: AccessReviewResponse }): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="text-sm text-muted-foreground">
          Generado el {formatDateTime(report.generated_at)}
        </p>
        <div className="flex flex-wrap items-start gap-2">
          <DownloadButton />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              window.print();
            }}
          >
            <Printer aria-hidden="true" />
            Imprimir o guardar en PDF
          </Button>
        </div>
      </div>
      <Totals report={report} />
      <SimpleTable headers={HEADERS} caption={CAPTION}>
        {report.users.map((user) => (
          <ReviewRow key={user.id} user={user} />
        ))}
      </SimpleTable>
    </div>
  );
}

/** Informe de revisión de accesos para la Dirección (iam.access_review.read). */
export function AccessReviewPanel(): JSX.Element {
  const report = useAccessReview();
  return (
    <QueryState query={report} loadingLabel="Preparando el informe">
      {(data) => <Report report={data} />}
    </QueryState>
  );
}
