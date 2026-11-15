'use client';

import {
  certifiableHoursResponseSchema,
  certifiableProjectsResponseSchema,
  costCertificationListResponseSchema,
  createCostCertificationSchema,
  invoiceCreatedResponseSchema,
  type CostCertification,
  type CreateCostCertification,
} from '@arza/contracts';
import { EmptyState, SimpleTable } from '@arza/ui';
import { FileCheck } from 'lucide-react';
import { useState, type JSX } from 'react';

import { FormSummary } from '../../components/form-summary';
import { PageHeader } from '../../components/app-shell/page-header';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { formatPesos } from '../crm/labels';
import { usePermissions } from '../session/permissions';
import {
  LedgerChoice,
  LedgerField,
  NewRecord,
  monthLabel,
  problemsOf,
  useLedgerAction,
  useLedgerQuery,
} from './ledger-ui';

// Certificación de costos de desarrollo (B32): las horas aprobadas las trae Proyectos; el valor lo
// digita usted, porque la plataforma aún no conoce el costo por hora.

const PHASES = {
  research: 'Investigación',
  development: 'Desarrollo tecnológico',
  innovation: 'Innovación',
} as const;

const FIELDS = [
  { field: 'project_id', id: 'cert-project', label: 'Proyecto' },
  { field: 'period', id: 'cert-period', label: 'Mes' },
  { field: 'phase', id: 'cert-phase', label: 'Fase' },
  { field: 'amount', id: 'cert-amount', label: 'Valor certificado' },
];

export function CertificationsPanel(): JSX.Element {
  const list = useLedgerQuery(
    '/v1/finance/cost-certifications',
    costCertificationListResponseSchema,
  );
  const { can } = usePermissions();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Certificación de costos"
        description="Horas aprobadas y valor certificado de los proyectos de desarrollo, por mes."
      />
      <NewRecord
        allowed={can('finance.cost_certification.manage')}
        label="Nueva certificación"
        title="Certificar costos de desarrollo"
        description="Las horas se toman de las aprobadas en el proyecto durante el mes."
      >
        {(close) => <CertificationForm onDone={close} />}
      </NewRecord>
      <QueryState query={list} loadingLabel="Cargando certificaciones">
        {(result) =>
          result.data.length === 0 ? (
            <EmptyState
              icon={<FileCheck />}
              title="Aún no hay certificaciones"
              description="Certifique los costos de un proyecto en un mes."
            />
          ) : (
            <CertificationTable rows={result.data} />
          )
        }
      </QueryState>
    </div>
  );
}

function CertificationTable({
  rows,
}: {
  readonly rows: readonly CostCertification[];
}): JSX.Element {
  return (
    <SimpleTable
      headers={['Código', 'Proyecto', 'Mes', 'Fase', 'Horas', 'Valor']}
      caption="Certificaciones de costos"
    >
      {rows.map((row) => (
        <tr key={row.id}>
          <td className="p-2 font-medium">{row.code}</td>
          <td className="p-2">
            {row.project.code} · {row.project.name}
          </td>
          <td className="p-2">{monthLabel(row.period)}</td>
          <td className="p-2">{PHASES[row.phase]}</td>
          <td className="p-2">{row.hours.replace('.', ',')}</td>
          <td className="p-2">{formatPesos(row.amount)}</td>
        </tr>
      ))}
    </SimpleTable>
  );
}

function useCertificationForm(onDone: () => void) {
  const api = useApiClient();
  const [values, setValues] = useState({ project_id: '', period: '', phase: '', amount: '' });
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [key] = useState(() => crypto.randomUUID());
  const action = useLedgerAction<CreateCostCertification>(
    (body, csrfToken) =>
      api.post('/v1/finance/cost-certifications', {
        body,
        schema: invoiceCreatedResponseSchema,
        idempotencyKey: key,
        csrfToken,
      }),
    onDone,
  );
  const submit = (): void => {
    const valid = createCostCertificationSchema.safeParse(values);
    setProblems(valid.success ? {} : problemsOf(valid.error));
    if (valid.success) action.execute(valid.data);
  };
  const set = (name: keyof typeof values) => (value: string) => {
    setValues((now) => ({ ...now, [name]: value }));
  };
  return { values, set, problems, action, submit };
}

function CertificationForm({ onDone }: { readonly onDone: () => void }): JSX.Element {
  const form = useCertificationForm(onDone);
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
      <CertificationFields form={form} />
      <ApprovedHours projectId={form.values.project_id} period={form.values.period} />
      {form.action.error === null ? null : <FormError error={form.action.error} />}
      <SubmitButton label="Certificar" pendingLabel="Certificando…" pending={form.action.pending} />
      {form.action.dialog}
    </form>
  );
}

function CertificationFields({
  form,
}: {
  readonly form: ReturnType<typeof useCertificationForm>;
}): JSX.Element {
  const { values, set, problems } = form;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ProjectChoice form={form} />
      <LedgerField
        id="cert-period"
        label="Mes"
        type="month"
        value={values.period}
        onChange={set('period')}
        error={problems['period']}
      />
      <LedgerChoice
        id="cert-phase"
        label="Fase"
        value={values.phase}
        onChange={set('phase')}
        error={problems['phase']}
        options={Object.entries(PHASES).map(([value, label]) => ({ value, label }))}
      />
      <LedgerField
        id="cert-amount"
        label="Valor certificado"
        decimal
        value={values.amount}
        onChange={set('amount')}
        error={problems['amount']}
      />
    </div>
  );
}

function ProjectChoice({
  form,
}: {
  readonly form: ReturnType<typeof useCertificationForm>;
}): JSX.Element {
  const projects = useLedgerQuery(
    '/v1/finance/cost-certifications/projects',
    certifiableProjectsResponseSchema,
  );
  return (
    <LedgerChoice
      id="cert-project"
      label="Proyecto"
      value={form.values.project_id}
      onChange={form.set('project_id')}
      error={form.problems['project_id']}
      options={(projects.data?.data ?? []).map((project) => ({
        value: project.id,
        label: `${project.code} · ${project.name}`,
      }))}
    />
  );
}

function ApprovedHours(props: {
  readonly projectId: string;
  readonly period: string;
}): JSX.Element | null {
  const ready = props.projectId !== '' && /^\d{4}-\d{2}$/u.test(props.period);
  const query = useLedgerQuery(
    `/v1/finance/cost-certifications/hours?project_id=${props.projectId}&period=${props.period}`,
    certifiableHoursResponseSchema,
    ready,
  );
  if (!ready || query.data === undefined) return null;
  return (
    <p role="status" className="text-sm text-muted-foreground">
      Horas aprobadas en el mes: {query.data.data.hours.replace('.', ',')}
    </p>
  );
}
