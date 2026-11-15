'use client';

import {
  createPettyCashMovementSchema,
  invoiceCreatedResponseSchema,
  pettyCashResponseSchema,
  type CreatePettyCashMovement,
  type PettyCashMovement,
  type PettyCashResponse,
} from '@arza/contracts';
import { EmptyState, SimpleTable, StatCard } from '@arza/ui';
import { Wallet } from 'lucide-react';
import { useState, type JSX } from 'react';

import { FormSummary } from '../../components/form-summary';
import { PageHeader } from '../../components/app-shell/page-header';
import { formatDate } from '../../lib/format/date-time';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { formatPesos } from '../crm/labels';
import { usePermissions } from '../session/permissions';
import {
  CategoryChoice,
  CostCenterChoice,
  LedgerChoice,
  LedgerField,
  NewRecord,
  problemsOf,
  useLedgerAction,
  useLedgerQuery,
} from './ledger-ui';

// Caja menor (B32): una por empresa. Apertura del fondo, vales y reembolsos; el saldo nunca es
// negativo ni pasa del fondo. El arqueo queda para más adelante.

const TYPES = { opening: 'Apertura', voucher: 'Vale', replenishment: 'Reembolso' } as const;

const FIELDS = [
  { field: 'type', id: 'cash-type', label: 'Tipo' },
  { field: 'movement_date', id: 'cash-date', label: 'Fecha' },
  { field: 'amount', id: 'cash-amount', label: 'Valor' },
  { field: 'concept', id: 'cash-concept', label: 'Concepto' },
  { field: 'cost_center_id', id: 'cash-center', label: 'Centro de costo' },
  { field: 'category', id: 'cash-category', label: 'Rubro' },
];

export function PettyCashPanel(): JSX.Element {
  const ledger = useLedgerQuery('/v1/finance/petty-cash', pettyCashResponseSchema);
  const { can } = usePermissions();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Caja menor"
        description="Fondo, vales y reembolsos con el saldo de cada movimiento."
      />
      <NewRecord
        allowed={can('finance.petty_cash.manage')}
        label="Registrar movimiento"
        title="Movimiento de caja menor"
        description="Un vale lleva centro de costo y rubro."
      >
        {(close) => <MovementForm onDone={close} />}
      </NewRecord>
      <QueryState query={ledger} loadingLabel="Cargando la caja menor">
        {(result) => <CashSummary data={result.data} />}
      </QueryState>
    </div>
  );
}

function CashSummary({ data }: { readonly data: PettyCashResponse['data'] }): JSX.Element {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Saldo" value={formatPesos(data.balance)} />
        <StatCard label="Fondo" value={data.fund === null ? 'Sin abrir' : formatPesos(data.fund)} />
      </div>
      {data.movements.length === 0 ? (
        <EmptyState
          icon={<Wallet />}
          title="La caja menor no tiene movimientos"
          description="Ábrala con el valor del fondo."
        />
      ) : (
        <MovementTable movements={data.movements} />
      )}
    </>
  );
}

function MovementTable({
  movements,
}: {
  readonly movements: readonly PettyCashMovement[];
}): JSX.Element {
  return (
    <SimpleTable
      headers={['Código', 'Fecha', 'Tipo', 'Concepto', 'Valor', 'Saldo']}
      caption="Movimientos de la caja menor"
    >
      {movements.map((row) => (
        <tr key={row.id}>
          <td className="p-2 font-medium">{row.code}</td>
          <td className="p-2">{formatDate(row.movement_date)}</td>
          <td className="p-2">{TYPES[row.type]}</td>
          <td className="p-2">
            {row.concept}
            {row.cost_center === null ? null : (
              <span className="block text-xs text-muted-foreground">
                {row.cost_center.code} · {row.category?.label ?? ''}
              </span>
            )}
          </td>
          <td className="p-2">{formatPesos(row.amount)}</td>
          <td className="p-2">{formatPesos(row.balance)}</td>
        </tr>
      ))}
    </SimpleTable>
  );
}

const EMPTY = {
  type: '',
  movement_date: '',
  amount: '',
  concept: '',
  cost_center_id: '',
  category: '',
};

function useMovementForm(onDone: () => void) {
  const api = useApiClient();
  const [values, setValues] = useState(EMPTY);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [key] = useState(() => crypto.randomUUID());
  const action = useLedgerAction<CreatePettyCashMovement>(
    (body, csrfToken) =>
      api.post('/v1/finance/petty-cash/movements', {
        body,
        schema: invoiceCreatedResponseSchema,
        idempotencyKey: key,
        csrfToken,
      }),
    onDone,
  );
  const voucher = values.type === 'voucher';
  const submit = (): void => {
    const valid = createPettyCashMovementSchema.safeParse({
      ...values,
      cost_center_id: voucher ? values.cost_center_id || null : null,
      category: voucher ? values.category || null : null,
      support_file_id: null,
    });
    setProblems(valid.success ? {} : problemsOf(valid.error));
    if (valid.success) action.execute(valid.data);
  };
  const set = (name: keyof typeof EMPTY) => (value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
  };
  return { values, set, problems, action, submit, voucher };
}

function MovementForm({ onDone }: { readonly onDone: () => void }): JSX.Element {
  const form = useMovementForm(onDone);
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        form.submit();
      }}
    >
      <FormSummary problems={form.problems} fields={FIELDS} />
      <div className="grid gap-3 sm:grid-cols-2">
        <MovementFields form={form} />
        {form.voucher ? <VoucherFields form={form} /> : null}
      </div>
      {form.action.error === null ? null : <FormError error={form.action.error} />}
      <SubmitButton
        label="Registrar movimiento"
        pendingLabel="Registrando…"
        pending={form.action.pending}
      />
      {form.action.dialog}
    </form>
  );
}

function MovementFields({
  form,
}: {
  readonly form: ReturnType<typeof useMovementForm>;
}): JSX.Element {
  const { values, set, problems } = form;
  return (
    <>
      <TypeChoice form={form} />
      <LedgerField
        id="cash-date"
        label="Fecha"
        type="date"
        value={values.movement_date}
        onChange={set('movement_date')}
        error={problems['movement_date']}
      />
      <LedgerField
        id="cash-amount"
        label="Valor"
        decimal
        value={values.amount}
        onChange={set('amount')}
        error={problems['amount']}
      />
      <LedgerField
        id="cash-concept"
        label="Concepto"
        value={values.concept}
        onChange={set('concept')}
        error={problems['concept']}
      />
    </>
  );
}

function VoucherFields({
  form,
}: {
  readonly form: ReturnType<typeof useMovementForm>;
}): JSX.Element {
  return (
    <>
      <CostCenterChoice
        id="cash-center"
        value={form.values.cost_center_id}
        onChange={form.set('cost_center_id')}
        error={form.problems['cost_center_id']}
      />
      <CategoryChoice
        id="cash-category"
        value={form.values.category}
        onChange={form.set('category')}
        error={form.problems['category']}
      />
    </>
  );
}

function TypeChoice({ form }: { readonly form: ReturnType<typeof useMovementForm> }): JSX.Element {
  const { values, set, problems } = form;
  return (
    <LedgerChoice
      id="cash-type"
      label="Tipo"
      value={values.type}
      onChange={set('type')}
      error={problems['type']}
      options={Object.entries(TYPES).map(([value, label]) => ({ value, label }))}
    />
  );
}
