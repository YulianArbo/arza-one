'use client';

import type { Delegation } from '@arza/contracts';
import { Badge, EmptyState, TableCell, TableRow } from '@arza/ui';
import { Repeat } from 'lucide-react';
import type { JSX } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { usePermissions } from '../session/permissions';
import { useSession } from '../session/session-provider';
import { useAdminAction } from './admin-action';
import { DelegationForm } from './delegation-form';
import { DELEGATION_STATUS_LABELS, personName } from './labels';
import { ADMIN_KEYS, useDelegations } from './queries';
import { QueryState } from './query-state';
import { SimpleTable } from './simple-table';

function DelegationRow(props: {
  readonly delegation: Delegation;
  readonly canRevoke: boolean;
  readonly busy: boolean;
  readonly onRevoke: (id: string) => void;
}): JSX.Element {
  const { delegation } = props;
  const open = delegation.status === 'active' || delegation.status === 'scheduled';
  return (
    <TableRow>
      <TableCell>{personName(delegation.from_user)}</TableCell>
      <TableCell>{personName(delegation.to_user)}</TableCell>
      <TableCell>
        {formatDateTime(delegation.starts_at)} a {formatDateTime(delegation.ends_at)}
      </TableCell>
      <TableCell>{delegation.reason}</TableCell>
      <TableCell>
        <Badge tone={delegation.status === 'active' ? 'success' : 'neutral'}>
          {DELEGATION_STATUS_LABELS[delegation.status]}
        </Badge>
      </TableCell>
      <TableCell>
        {open && props.canRevoke ? (
          <ConfirmActionButton
            label="Retirar"
            title={`¿Retirar la delegación a ${personName(delegation.to_user)}?`}
            description="Dejará de poder aprobar en nombre de quien delegó desde este momento."
            confirmLabel="Sí, retirar"
            disabled={props.busy}
            onConfirm={() => {
              props.onRevoke(delegation.id);
            }}
          />
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function useRevokeDelegation() {
  const api = useApiClient();
  return useAdminAction<string>({
    run: (id, csrfToken) =>
      api.post(`/v1/delegations/${id}/actions/revoke`, { body: {}, csrfToken }),
    invalidate: [ADMIN_KEYS.delegations],
  });
}

const HEADERS = ['Delega', 'Recibe', 'Periodo', 'Motivo', 'Estado', ''];

function DelegationTable({
  delegations,
}: {
  readonly delegations: readonly Delegation[];
}): JSX.Element {
  const { session } = useSession();
  const permissions = usePermissions();
  const revoke = useRevokeDelegation();
  if (delegations.length === 0) {
    return (
      <EmptyState
        title="Todavía no hay delegaciones"
        description="Aquí verá las delegaciones que usted haga o reciba."
        icon={<Repeat />}
      />
    );
  }
  const canRevoke = (item: Delegation): boolean =>
    permissions.canAll('iam.delegation.manage') || item.from_user.id === session.user.id;
  return (
    <div className="flex flex-col gap-3">
      {revoke.error === null ? null : <FormError error={revoke.error} />}
      <SimpleTable headers={HEADERS}>
        {delegations.map((item) => (
          <DelegationRow
            key={item.id}
            delegation={item}
            canRevoke={canRevoke(item)}
            busy={revoke.pending}
            onRevoke={revoke.execute}
          />
        ))}
      </SimpleTable>
      {revoke.dialog}
    </div>
  );
}

/** Delegaciones de aprobaciones (iam.delegation.manage). */
export function DelegationsPanel(): JSX.Element {
  const delegations = useDelegations();
  return (
    <div className="flex flex-col gap-6">
      <DelegationForm />
      <QueryState query={delegations} loadingLabel="Cargando delegaciones">
        {(data) => <DelegationTable delegations={data.data} />}
      </QueryState>
    </div>
  );
}
