'use client';

import type { AccessReviewResponse } from '@arza/contracts';
import { Badge, Button, SimpleTable, TableCell, TableRow } from '@arza/ui';
import { Printer } from 'lucide-react';
import type { JSX } from 'react';

import { formatDateTime } from '../../lib/format/date-time';
import { USER_KIND_LABELS, USER_STATUS_LABELS, personName } from './labels';
import { useAccessReview } from './queries';
import { QueryState } from './query-state';

function Totals({ report }: { readonly report: AccessReviewResponse }): JSX.Element {
  const items = [
    { label: 'Cuentas', value: report.totals.users },
    { label: 'Activas', value: report.totals.active },
    { label: `Sin uso en ${String(report.unused_days)} días`, value: report.totals.unused },
    { label: 'Sin roles', value: report.totals.without_roles },
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-4">
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
        {formatDateTime(user.last_login_at)}{' '}
        {user.unused ? <Badge tone="warning">Sin uso</Badge> : null}
      </TableCell>
    </TableRow>
  );
}

const HEADERS = ['Persona', 'Tipo', 'Estado', 'Roles vigentes', 'Último ingreso'];
const CAPTION =
  'Revise que cada persona tenga solo los roles que necesita y retire las cuentas sin uso.';

function Report({ report }: { readonly report: AccessReviewResponse }): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="text-sm text-muted-foreground">
          Generado el {formatDateTime(report.generated_at)}
        </p>
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
