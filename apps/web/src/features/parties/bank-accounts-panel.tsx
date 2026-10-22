'use client';

import {
  bankAccountTypeSchema,
  createdResponseSchema,
  revealedBankAccountSchema,
  type BankAccount,
  type BankAccountType,
  type PartyDetail,
} from '@arza/contracts';
import {
  Badge,
  Button,
  DialogFooter,
  EmptyState,
  SelectField,
  SimpleTable,
  TableCell,
  TableRow,
} from '@arza/ui';
import { Landmark } from 'lucide-react';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useAdminAction } from '../administration/admin-action';
import { QueryState } from '../administration/query-state';
import { useCatalog } from '../organization/queries';
import { RecordDialog, TextInput } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { useSession } from '../session/session-provider';
import {
  ACCOUNT_STATUS_LABELS,
  ACCOUNT_STATUS_TONES,
  ACCOUNT_TYPE_LABELS,
  optionsFrom,
} from './labels';
import { PARTY_KEYS, useBankAccounts } from './queries';
import { ReviewButtons } from './review-buttons';

// Cuentas bancarias del tercero (ficha 17.3, dato restringido del numeral 12.4): se ven con los
// cuatro últimos dígitos; registrar, aprobar y ver el número completo piden confirmar la
// identidad, y la aprueba una persona distinta de quien la registró.

const REASON = 'Las cuentas bancarias son un dato restringido.';
const TYPE_OPTIONS = optionsFrom(bankAccountTypeSchema.options, ACCOUNT_TYPE_LABELS);

interface AccountValues {
  readonly bank: string;
  readonly accountType: BankAccountType;
  readonly accountNumber: string;
  readonly replacesId: string;
}

const EMPTY_ACCOUNT: AccountValues = {
  bank: '',
  accountType: 'savings',
  accountNumber: '',
  replacesId: '',
};

function useBanks() {
  const banks = useCatalog('banks').data?.items ?? [];
  return {
    options: [
      { value: '', label: 'Elija el banco' },
      ...banks.filter((b) => b.is_active).map((b) => ({ value: b.code, label: b.label })),
    ],
    label: (code: string) => banks.find((bank) => bank.code === code)?.label ?? code,
  };
}

function useRegisterAccount(partyId: string, onSaved: () => void) {
  const api = useApiClient();
  return useAdminAction<AccountValues, unknown>({
    run: (v, csrfToken) => {
      const body = {
        bank: v.bank,
        account_type: v.accountType,
        account_number: v.accountNumber.replaceAll(/\D/g, ''),
        replaces_id: v.replacesId === '' ? null : v.replacesId,
      };
      const path = `/v1/parties/${partyId}/bank-accounts`;
      return api.post(path, { body, schema: createdResponseSchema, csrfToken });
    },
    invalidate: [PARTY_KEYS.all],
    onSuccess: onSaved,
    reason: REASON,
  });
}

interface FieldProps {
  readonly values: AccountValues;
  readonly onChange: (values: AccountValues) => void;
}

function ReplacesField(props: FieldProps & { readonly approved: readonly BankAccount[] }) {
  const banks = useBanks();
  if (props.approved.length === 0) return null;
  return (
    <SelectField
      id="cuenta-reemplaza"
      label="Reemplaza a (opcional)"
      hint="Al aprobarse, la cuenta anterior deja de usarse."
      options={[
        { value: '', label: 'Ninguna: es una cuenta adicional' },
        ...props.approved.map((a) => ({
          value: a.id,
          label: `${banks.label(a.bank)} ${a.number_masked}`,
        })),
      ]}
      value={props.values.replacesId}
      onChange={(event) => {
        props.onChange({ ...props.values, replacesId: event.target.value });
      }}
    />
  );
}

function AccountFields({ values, onChange }: FieldProps): JSX.Element {
  const banks = useBanks();
  return (
    <>
      <SelectField
        id="cuenta-banco"
        label="Banco"
        options={banks.options}
        value={values.bank}
        onChange={(event) => {
          onChange({ ...values, bank: event.target.value });
        }}
      />
      <SelectField
        id="cuenta-tipo"
        label="Tipo de cuenta"
        options={TYPE_OPTIONS}
        value={values.accountType}
        onChange={(event) => {
          const type = bankAccountTypeSchema.safeParse(event.target.value);
          onChange({ ...values, accountType: type.success ? type.data : 'savings' });
        }}
      />
      <TextInput
        id="cuenta-numero"
        label="Número de cuenta"
        hint="Solo los números. Se guarda cifrado."
        inputMode="numeric"
        autoComplete="off"
        value={values.accountNumber}
        onValue={(accountNumber) => {
          onChange({ ...values, accountNumber });
        }}
      />
    </>
  );
}

function AccountForm(props: {
  readonly partyId: string;
  readonly approved: readonly BankAccount[];
  readonly onSaved: () => void;
}): JSX.Element {
  const [values, setValues] = useState(EMPTY_ACCOUNT);
  const save = useRegisterAccount(props.partyId, props.onSaved);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    save.execute(values);
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {save.error === null ? null : <FormError error={save.error} />}
      <AccountFields values={values} onChange={setValues} />
      <ReplacesField values={values} onChange={setValues} approved={props.approved} />
      <DialogFooter>
        <SubmitButton label="Registrar" pendingLabel="Registrando…" pending={save.pending} />
      </DialogFooter>
      {save.dialog}
    </form>
  );
}

/** Muestra el número completo; la consulta queda en la auditoría. */
function RevealButton(props: { readonly partyId: string; readonly account: BankAccount }) {
  const api = useApiClient();
  const reveal = useAdminAction<null, string>({
    run: async (_args, csrfToken) => {
      const path = `/v1/parties/${props.partyId}/bank-accounts/${props.account.id}/actions/reveal`;
      const options = { body: {}, schema: revealedBankAccountSchema, csrfToken };
      return (await api.post(path, options)).account_number;
    },
    invalidate: [PARTY_KEYS.all],
    reason: REASON,
  });
  const show = (): void => {
    reveal.execute(null);
  };
  return (
    <div className="flex flex-col gap-1">
      {reveal.result === undefined ? (
        <Button type="button" size="sm" variant="outline" disabled={reveal.pending} onClick={show}>
          Ver número completo
        </Button>
      ) : (
        <span className="font-mono text-sm">Número: {reveal.result}</span>
      )}
      {reveal.error === null ? null : <FormError error={reveal.error} />}
      {reveal.dialog}
    </div>
  );
}

function AccountStatus({ account }: { readonly account: BankAccount }): JSX.Element {
  const who = account.requested_by?.display_name ?? 'el sistema';
  return (
    <>
      <Badge tone={ACCOUNT_STATUS_TONES[account.status]}>
        {ACCOUNT_STATUS_LABELS[account.status]}
      </Badge>
      <p className="text-xs text-muted-foreground">
        Registró {who}, {formatDateTime(account.requested_at)}
      </p>
      {account.review_note === null ? null : (
        <p className="text-xs">Motivo: {account.review_note}</p>
      )}
    </>
  );
}

function AccountRow(props: { readonly partyId: string; readonly account: BankAccount }) {
  const { partyId, account } = props;
  const { session } = useSession();
  const canApprove = usePermissions().can('party.bank_account.approve');
  const banks = useBanks();
  return (
    <TableRow>
      <TableCell className="font-medium">{banks.label(account.bank)}</TableCell>
      <TableCell>
        {ACCOUNT_TYPE_LABELS[account.account_type]} {account.number_masked}
      </TableCell>
      <TableCell>
        <AccountStatus account={account} />
      </TableCell>
      <TableCell className="flex flex-wrap gap-2">
        <RevealButton partyId={partyId} account={account} />
        {account.status === 'pending' && canApprove ? (
          <ReviewButtons
            path={`/v1/parties/${partyId}/bank-accounts/${account.id}/actions`}
            what="la cuenta bancaria"
            ownRequest={account.requested_by?.id === session.user.id}
            reason={REASON}
          />
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function AccountTable(props: {
  readonly partyId: string;
  readonly accounts: readonly BankAccount[];
}) {
  if (props.accounts.length === 0) {
    return (
      <EmptyState
        icon={<Landmark />}
        title="Todavía no hay cuentas bancarias"
        description="Las cuentas para pagos aparecen aquí con sus cuatro últimos dígitos."
      />
    );
  }
  return (
    <SimpleTable headers={['Banco', 'Cuenta', 'Estado', '']}>
      {props.accounts.map((account) => (
        <AccountRow key={account.id} partyId={props.partyId} account={account} />
      ))}
    </SimpleTable>
  );
}

export function BankAccountsPanel({ party }: { readonly party: PartyDetail }): JSX.Element {
  const accounts = useBankAccounts(party.id);
  const canManage = usePermissions().can('party.bank_account.manage');
  const approved = accounts.data?.data.filter((a) => a.status === 'approved') ?? [];
  return (
    <div className="flex flex-col gap-4">
      {canManage ? (
        <div>
          <RecordDialog
            triggerLabel="Registrar una cuenta"
            title={`Registrar una cuenta de ${party.name}`}
            description="Queda pendiente hasta que otra persona la apruebe. Se le pedirá confirmar su identidad."
          >
            {(close) => <AccountForm partyId={party.id} approved={approved} onSaved={close} />}
          </RecordDialog>
        </div>
      ) : null}
      <QueryState query={accounts} loadingLabel="Cargando las cuentas bancarias">
        {({ data }) => <AccountTable partyId={party.id} accounts={data} />}
      </QueryState>
    </div>
  );
}
