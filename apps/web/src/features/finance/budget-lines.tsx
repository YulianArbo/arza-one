'use client';

import {
  replaceBudgetLinesSchema,
  type BudgetDetail,
  type BudgetLine,
  type ReplaceBudgetLines,
} from '@arza/contracts';
import { Button, SimpleTable } from '@arza/ui';
import { useState, type JSX } from 'react';

import { FormSummary } from '../../components/form-summary';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { formatPesos } from '../crm/labels';
import { usePermissions } from '../session/permissions';
import {
  CategoryChoice,
  CostCenterChoice,
  LedgerChoice,
  LedgerField,
  problemsOf,
  useLedgerAction,
  useValues,
} from './ledger-ui';

// Líneas de un presupuesto en borrador: agregar y quitar guarda todas las líneas de una vez.

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const FIELDS = [
  { field: 'cost_center_id', id: 'line-center', label: 'Centro de costo' },
  { field: 'category', id: 'line-category', label: 'Rubro' },
  { field: 'month', id: 'line-month', label: 'Mes' },
  { field: 'planned', id: 'line-planned', label: 'Valor planeado' },
];

type LineInput = ReplaceBudgetLines['lines'][number];

function inputOf(line: BudgetLine): LineInput {
  return {
    cost_center_id: line.cost_center.id,
    category: line.category.code,
    month: line.month,
    planned: line.planned,
  };
}

function useSaveLines(budget: BudgetDetail, onDone?: () => void) {
  const api = useApiClient();
  return useLedgerAction<ReplaceBudgetLines>(
    (body, csrfToken) =>
      api.put(`/v1/finance/budgets/${budget.id}/lines`, {
        body,
        version: budget.version,
        csrfToken,
      }),
    onDone,
  );
}

export function BudgetLineEditor({ budget }: { readonly budget: BudgetDetail }): JSX.Element {
  const { can } = usePermissions();
  const editable = budget.status === 'draft' && can('finance.budget.manage');
  return (
    <div className="flex flex-col gap-4">
      <BudgetLineTable budget={budget} editable={editable} />
      {editable ? <AddLineForm budget={budget} /> : null}
    </div>
  );
}

function BudgetLineTable(props: {
  readonly budget: BudgetDetail;
  readonly editable: boolean;
}): JSX.Element {
  const save = useSaveLines(props.budget);
  if (props.budget.lines.length === 0) {
    return <p className="text-sm text-muted-foreground">Este presupuesto aún no tiene líneas.</p>;
  }
  const remove = (id: string): void => {
    const lines = props.budget.lines.filter((line) => line.id !== id).map(inputOf);
    save.execute({ lines });
  };
  return (
    <>
      <SimpleTable headers={['Centro de costo', 'Rubro', 'Mes', 'Planeado', '']} caption="Líneas">
        {props.budget.lines.map((line) => (
          <tr key={line.id}>
            <td className="p-2">{line.cost_center.code}</td>
            <td className="p-2">{line.category.label}</td>
            <td className="p-2">{MONTHS[line.month - 1]}</td>
            <td className="p-2">{formatPesos(line.planned)}</td>
            <td className="p-2">
              {props.editable ? <RemoveButton line={line} onRemove={remove} /> : null}
            </td>
          </tr>
        ))}
      </SimpleTable>
      {save.error === null ? null : <FormError error={save.error} />}
      {save.dialog}
    </>
  );
}

function RemoveButton(props: {
  readonly line: BudgetLine;
  readonly onRemove: (id: string) => void;
}): JSX.Element {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      aria-label={`Quitar la línea ${props.line.cost_center.code} ${props.line.category.label} ${MONTHS[props.line.month - 1] ?? ''}`}
      onClick={() => {
        props.onRemove(props.line.id);
      }}
    >
      Quitar
    </Button>
  );
}

const EMPTY_LINE = { cost_center_id: '', category: '', month: '', planned: '' };

function AddLineForm({ budget }: { readonly budget: BudgetDetail }): JSX.Element {
  const form = useValues(EMPTY_LINE);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const save = useSaveLines(budget, form.reset);
  const submit = (): void => {
    const line = { ...form.values, month: Number(form.values.month) || 0 };
    const valid = replaceBudgetLinesSchema.safeParse({
      lines: [...budget.lines.map(inputOf), line],
    });
    setProblems(valid.success ? {} : problemsOf(valid.error, 2));
    if (valid.success) save.execute(valid.data);
  };
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      aria-label="Agregar línea al presupuesto"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <FormSummary problems={problems} fields={FIELDS} />
      <LineFields form={form} problems={problems} />
      {save.error === null ? null : <FormError error={save.error} />}
      <SubmitButton label="Agregar línea" pendingLabel="Guardando…" pending={save.pending} />
      {save.dialog}
    </form>
  );
}

function LineFields(props: {
  readonly form: ReturnType<typeof useValues<typeof EMPTY_LINE>>;
  readonly problems: Record<string, string>;
}): JSX.Element {
  const { values, set } = props.form;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <CostCenterChoice
        id="line-center"
        value={values.cost_center_id}
        onChange={set('cost_center_id')}
        error={props.problems['cost_center_id']}
      />
      <CategoryChoice
        id="line-category"
        value={values.category}
        onChange={set('category')}
        error={props.problems['category']}
      />
      <LedgerChoice
        id="line-month"
        label="Mes"
        value={values.month}
        onChange={set('month')}
        error={props.problems['month']}
        options={MONTHS.map((label, index) => ({ value: String(index + 1), label }))}
      />
      <LedgerField
        id="line-planned"
        label="Valor planeado"
        value={values.planned}
        onChange={set('planned')}
        error={props.problems['planned']}
        decimal
      />
    </div>
  );
}
