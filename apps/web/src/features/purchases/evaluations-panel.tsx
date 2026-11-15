'use client';

import {
  SUPPLIER_CRITERIA,
  createSupplierEvaluationSchema,
  purchaseCreatedResponseSchema,
  supplierEvaluationListResponseSchema,
  supplierScore,
  type CreateSupplierEvaluation,
  type SupplierEvaluation,
} from '@arza/contracts';
import { Badge, EmptyState, SimpleTable } from '@arza/ui';
import { Star } from 'lucide-react';
import { useState, type JSX } from 'react';

import { FormSummary } from '../../components/form-summary';
import { PageHeader } from '../../components/app-shell/page-header';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { LedgerChoice, LedgerField, NewRecord, problemsOf, useValues } from '../finance/ledger-ui';
import { usePermissions } from '../session/permissions';
import { CRITERIA_LABELS, EVALUATION_KINDS, EVALUATION_RESULTS, scoreText } from './labels';
import { usePurchaseAction, usePurchaseOptions, usePurchaseQuery } from './purchase-ui';

// Selección, evaluación y reevaluación de proveedores (B33, RE-ADM-001): cuatro criterios de 1 a 5
// y un resultado por puntaje. Una evaluación por proveedor, tipo y periodo; no se edita.

const GRADES = ['1', '2', '3', '4', '5'].map((grade) => ({ value: grade, label: grade }));

const FIELDS = [
  { field: 'supplier_id', id: 'evaluation-supplier', label: 'Proveedor' },
  { field: 'period', id: 'evaluation-period', label: 'Periodo' },
  { field: 'criteria', id: 'evaluation-quality', label: 'Calificaciones' },
];

const EMPTY = {
  supplier_id: '',
  kind: 'reevaluation',
  period: '',
  quality: '',
  compliance: '',
  price: '',
  service: '',
  note: '',
};

type Values = ReturnType<typeof useValues<typeof EMPTY>>;

export function EvaluationsPanel(): JSX.Element {
  const { can } = usePermissions();
  const evaluations = usePurchaseQuery(
    '/v1/supplier-evaluations',
    supplierEvaluationListResponseSchema,
  );
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Evaluación de proveedores"
        description="Selección y reevaluación de proveedores por periodo, con su puntaje y resultado."
      />
      <NewRecord
        allowed={can('purchase.supplier.evaluate')}
        label="Evaluar proveedor"
        title="Evaluar proveedor"
        description="Califique de 1 a 5. Con 4 o más queda aprobado; de 3 a menos de 4, condicionado."
      >
        {(close) => <EvaluationForm onDone={close} />}
      </NewRecord>
      <QueryState query={evaluations} loadingLabel="Cargando evaluaciones">
        {(result) =>
          result.data.length === 0 ? (
            <EmptyState
              icon={<Star />}
              title="Aún no hay evaluaciones"
              description="Las evaluaciones de proveedores aparecerán aquí."
            />
          ) : (
            <EvaluationTable evaluations={result.data} />
          )
        }
      </QueryState>
    </div>
  );
}

function EvaluationTable(props: {
  readonly evaluations: readonly SupplierEvaluation[];
}): JSX.Element {
  return (
    <SimpleTable
      headers={['Proveedor', 'Tipo', 'Periodo', 'Calificaciones', 'Puntaje', 'Resultado']}
      caption="Evaluaciones de proveedores"
    >
      {props.evaluations.map((row) => (
        <tr key={row.id}>
          <td className="p-2 font-medium">{row.supplier.name}</td>
          <td className="p-2">{EVALUATION_KINDS[row.kind]}</td>
          <td className="p-2">{row.period}</td>
          <td className="p-2 text-xs">
            {SUPPLIER_CRITERIA.map(
              (key) => `${CRITERIA_LABELS[key]} ${String(row.criteria[key])}`,
            ).join(' · ')}
          </td>
          <td className="p-2">{scoreText(row.score)}</td>
          <td className="p-2">
            <Badge>{EVALUATION_RESULTS[row.result]}</Badge>
            {row.note === null ? null : (
              <span className="block text-xs text-muted-foreground">{row.note}</span>
            )}
          </td>
        </tr>
      ))}
    </SimpleTable>
  );
}

function bodyOf(values: typeof EMPTY): unknown {
  return {
    supplier_id: values.supplier_id,
    kind: values.kind,
    period: values.period.trim(),
    criteria: Object.fromEntries(SUPPLIER_CRITERIA.map((key) => [key, Number(values[key])])),
    note: values.note.trim() === '' ? null : values.note,
  };
}

function useEvaluationForm(onDone: () => void) {
  const api = useApiClient();
  const form = useValues(EMPTY);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const action = usePurchaseAction<CreateSupplierEvaluation>(
    (body, csrfToken) =>
      api.post('/v1/supplier-evaluations', {
        body,
        schema: purchaseCreatedResponseSchema,
        csrfToken,
      }),
    onDone,
  );
  const submit = (): void => {
    const valid = createSupplierEvaluationSchema.safeParse(bodyOf(form.values));
    const found = valid.success ? {} : problemsOf(valid.error);
    if (found['criteria'] !== undefined) found['criteria'] = 'Califique los cuatro criterios.';
    setProblems(found);
    if (valid.success) action.execute(valid.data);
  };
  return { form, problems, action, submit };
}

function EvaluationForm({ onDone }: { readonly onDone: () => void }): JSX.Element {
  const { form, problems, action, submit } = useEvaluationForm(onDone);
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <FormSummary problems={problems} fields={FIELDS} />
      <EvaluationSubject form={form} problems={problems} />
      <EvaluationGrades form={form} problem={problems['criteria']} />
      <LedgerField
        id="evaluation-note"
        label="Observación (opcional)"
        value={form.values.note}
        onChange={form.set('note')}
        error={problems['note']}
      />
      {action.error === null ? null : <FormError error={action.error} />}
      <SubmitButton label="Guardar evaluación" pendingLabel="Guardando…" pending={action.pending} />
      {action.dialog}
    </form>
  );
}

function EvaluationSubject(props: {
  readonly form: Values;
  readonly problems: Record<string, string>;
}): JSX.Element {
  const options = usePurchaseOptions();
  const { values, set } = props.form;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <LedgerChoice
        id="evaluation-supplier"
        label="Proveedor"
        value={values.supplier_id}
        onChange={set('supplier_id')}
        error={props.problems['supplier_id'] === undefined ? undefined : 'Elija un proveedor.'}
        options={(options?.suppliers ?? []).map((item) => ({ value: item.id, label: item.name }))}
      />
      <LedgerChoice
        id="evaluation-kind"
        label="Tipo"
        value={values.kind}
        onChange={set('kind')}
        error={props.problems['kind'] === undefined ? undefined : 'Elija el tipo.'}
        options={[
          { value: 'reevaluation', label: 'Reevaluación' },
          { value: 'selection', label: 'Selección' },
        ]}
      />
      <LedgerField
        id="evaluation-period"
        label="Periodo"
        hint="El año (2026) o el semestre (2026-1 o 2026-2)."
        value={values.period}
        onChange={set('period')}
        error={props.problems['period']}
      />
    </div>
  );
}

function gradesOf(values: typeof EMPTY): string | null {
  const grades = SUPPLIER_CRITERIA.map((key) => Number(values[key]));
  if (grades.some((grade) => !Number.isInteger(grade) || grade < 1 || grade > 5)) return null;
  const [quality = 0, compliance = 0, price = 0, service = 0] = grades;
  const { score, result } = supplierScore({ quality, compliance, price, service });
  return `Puntaje ${scoreText(score)}: ${EVALUATION_RESULTS[result]}.`;
}

function EvaluationGrades(props: {
  readonly form: Values;
  readonly problem: string | undefined;
}): JSX.Element {
  const { values, set } = props.form;
  const preview = gradesOf(values);
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium">Calificaciones de 1 a 5</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {SUPPLIER_CRITERIA.map((key) => (
          <LedgerChoice
            key={key}
            id={`evaluation-${key}`}
            label={CRITERIA_LABELS[key]}
            value={values[key]}
            onChange={set(key)}
            error={props.problem !== undefined && values[key] === '' ? 'Califique.' : undefined}
            options={GRADES}
          />
        ))}
      </div>
      {preview === null ? null : (
        <p className="text-sm" role="status">
          {preview}
        </p>
      )}
    </fieldset>
  );
}
