'use client';

import {
  invoiceCreatedResponseSchema,
  reconciliationListResponseSchema,
  saveReconciliationSchema,
  type Reconciliation,
  type SaveReconciliation,
} from '@arza/contracts';
import { Badge, Button, EmptyState, SimpleTable } from '@arza/ui';
import { Scale } from 'lucide-react';
import { useState, type JSX } from 'react';

import { FormSummary } from '../../components/form-summary';
import { PageHeader } from '../../components/app-shell/page-header';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { formatPesos } from '../crm/labels';
import { RecordDialog } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import {
  ActionButton,
  LedgerField,
  monthLabel,
  problemsOf,
  useLedgerAction,
  useLedgerQuery,
} from './ledger-ui';

// Conciliación bancaria (B32): por cuenta (nombre corto, nunca el número completo) y mes. Se
// cierra cuando las partidas explican toda la diferencia entre libros y banco.

const STATUS = { draft: 'Borrador', reconciled: 'Conciliada' } as const;

const FIELDS = [
  { field: 'account', id: 'rec-account', label: 'Cuenta' },
  { field: 'period', id: 'rec-period', label: 'Mes' },
  { field: 'book_balance', id: 'rec-book', label: 'Saldo en libros' },
  { field: 'bank_balance', id: 'rec-bank', label: 'Saldo del banco' },
  { field: 'differences', id: 'rec-item-description', label: 'Partidas' },
];

export function ReconciliationsPanel(): JSX.Element {
  const list = useLedgerQuery('/v1/finance/bank-reconciliations', reconciliationListResponseSchema);
  const { can } = usePermissions();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Conciliación bancaria"
        description="Saldo en libros contra saldo del banco, con las partidas que explican la diferencia."
      />
      {can('finance.reconciliation.manage') ? (
        <div>
          <RecordDialog
            triggerLabel="Nueva conciliación"
            title="Nueva conciliación"
            description="Nombre la cuenta con un nombre corto, como «Banco ahorros ···1234»."
          >
            {(close) => <ReconciliationForm onDone={close} />}
          </RecordDialog>
        </div>
      ) : null}
      <QueryState query={list} loadingLabel="Cargando conciliaciones">
        {(result) =>
          result.data.length === 0 ? (
            <EmptyState
              icon={<Scale />}
              title="Aún no hay conciliaciones"
              description="Registre la del mes con los saldos y las partidas."
            />
          ) : (
            <ReconciliationTable rows={result.data} />
          )
        }
      </QueryState>
    </div>
  );
}

function ReconciliationTable({ rows }: { readonly rows: readonly Reconciliation[] }): JSX.Element {
  const { can } = usePermissions();
  return (
    <SimpleTable
      headers={['Cuenta', 'Mes', 'Libros', 'Banco', 'Sin explicar', 'Estado', '']}
      caption="Conciliaciones bancarias"
    >
      {rows.map((row) => (
        <tr key={row.id}>
          <td className="p-2 font-medium">{row.account}</td>
          <td className="p-2">{monthLabel(row.period)}</td>
          <td className="p-2">{formatPesos(row.book_balance)}</td>
          <td className="p-2">{formatPesos(row.bank_balance)}</td>
          <td className="p-2">{formatPesos(row.unexplained)}</td>
          <td className="p-2">
            <Badge>{STATUS[row.status]}</Badge>
          </td>
          <td className="p-2">
            {row.status === 'draft' && can('finance.reconciliation.manage') ? (
              <DraftActions row={row} />
            ) : null}
          </td>
        </tr>
      ))}
    </SimpleTable>
  );
}

function DraftActions({ row }: { readonly row: Reconciliation }): JSX.Element {
  const api = useApiClient();
  return (
    <div className="flex flex-wrap gap-2">
      <RecordDialog
        triggerLabel="Editar"
        triggerAriaLabel={`Editar la conciliación ${row.account} ${monthLabel(row.period)}`}
        title="Editar conciliación"
        description="Ajuste los saldos o las partidas."
        variant="outline"
      >
        {(close) => <ReconciliationForm current={row} onDone={close} />}
      </RecordDialog>
      <ActionButton
        label="Cerrar"
        pendingLabel="Cerrando…"
        ariaLabel={`Cerrar la conciliación ${row.account} ${monthLabel(row.period)}`}
        run={(csrfToken) =>
          api.post(`/v1/finance/bank-reconciliations/${row.id}/close`, {
            body: {},
            version: row.version,
            csrfToken,
          })
        }
      />
    </div>
  );
}

interface Item {
  description: string;
  amount: string;
}

function useReconciliationForm(current: Reconciliation | undefined, onDone: () => void) {
  const api = useApiClient();
  const [values, setValues] = useState({
    account: current?.account ?? '',
    period: current?.period ?? '',
    book_balance: current?.book_balance ?? '',
    bank_balance: current?.bank_balance ?? '',
  });
  const [items, setItems] = useState<Item[]>(current?.differences ?? []);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const action = useLedgerAction<SaveReconciliation>(
    (body, csrfToken) =>
      current === undefined
        ? api.post('/v1/finance/bank-reconciliations', {
            body,
            schema: invoiceCreatedResponseSchema,
            csrfToken,
          })
        : api.put(`/v1/finance/bank-reconciliations/${current.id}`, {
            body,
            version: current.version,
            csrfToken,
          }),
    onDone,
  );
  const submit = (): void => {
    const valid = saveReconciliationSchema.safeParse({ ...values, differences: items });
    setProblems(valid.success ? {} : problemsOf(valid.error));
    if (valid.success) action.execute(valid.data);
  };
  const set = (name: keyof typeof values) => (value: string) => {
    setValues((now) => ({ ...now, [name]: value }));
  };
  return { values, set, items, setItems, problems, action, submit };
}

function ReconciliationForm(props: {
  readonly current?: Reconciliation;
  readonly onDone: () => void;
}): JSX.Element {
  const form = useReconciliationForm(props.current, props.onDone);
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
      <BalanceFields form={form} />
      <ItemsEditor items={form.items} setItems={form.setItems} />
      {form.action.error === null ? null : <FormError error={form.action.error} />}
      <SubmitButton
        label="Guardar conciliación"
        pendingLabel="Guardando…"
        pending={form.action.pending}
      />
      {form.action.dialog}
    </form>
  );
}

const BALANCE_INPUTS = [
  { name: 'account', id: 'rec-account', label: 'Cuenta' },
  { name: 'period', id: 'rec-period', label: 'Mes', type: 'month' },
  { name: 'book_balance', id: 'rec-book', label: 'Saldo en libros', decimal: true },
  { name: 'bank_balance', id: 'rec-bank', label: 'Saldo del banco', decimal: true },
] as const;

function BalanceFields({
  form,
}: {
  readonly form: ReturnType<typeof useReconciliationForm>;
}): JSX.Element {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {BALANCE_INPUTS.map((input) => (
        <LedgerField
          key={input.name}
          id={input.id}
          label={input.label}
          type={'type' in input ? input.type : 'text'}
          decimal={'decimal' in input}
          value={form.values[input.name]}
          onChange={form.set(input.name)}
          error={form.problems[input.name]}
        />
      ))}
    </div>
  );
}

function ItemsEditor(props: {
  readonly items: Item[];
  readonly setItems: (items: Item[]) => void;
}): JSX.Element {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">
        Partidas que explican la diferencia (negativo si resta)
      </legend>
      <ul className="flex flex-col gap-1 text-sm">
        {props.items.map((item, index) => (
          <li
            key={`${item.description}-${String(index)}`}
            className="flex items-center justify-between gap-2"
          >
            <span>
              {item.description}: {formatPesos(item.amount)}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`Quitar la partida ${item.description}`}
              onClick={() => {
                props.setItems(props.items.filter((_, i) => i !== index));
              }}
            >
              Quitar
            </Button>
          </li>
        ))}
      </ul>
      <NewItem
        onAdd={(item) => {
          props.setItems([...props.items, item]);
        }}
      />
    </fieldset>
  );
}

function NewItem({ onAdd }: { readonly onAdd: (item: Item) => void }): JSX.Element {
  const [draft, setDraft] = useState<Item>({ description: '', amount: '' });
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
      <LedgerField
        id="rec-item-description"
        label="Partida"
        value={draft.description}
        onChange={(description) => {
          setDraft({ ...draft, description });
        }}
      />
      <LedgerField
        id="rec-item-amount"
        label="Valor"
        decimal
        value={draft.amount}
        onChange={(amount) => {
          setDraft({ ...draft, amount });
        }}
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          onAdd(draft);
          setDraft({ description: '', amount: '' });
        }}
      >
        Agregar partida
      </Button>
    </div>
  );
}
