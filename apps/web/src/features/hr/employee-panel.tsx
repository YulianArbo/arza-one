'use client';

import {
  cancelHiringSchema,
  downloadLinkResponseSchema,
  employeeDetailResponseSchema,
  EMPLOYMENT_CONTRACT_STATUS,
  EMPLOYEE_STATUS,
  FILE_ITEMS,
  FILE_ITEM_STATUS,
  type EmployeeDetail,
} from '@arza/contracts';
import { Button } from '@arza/ui';
import { Fragment, type JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import type { AdminAction } from '../administration/admin-action';
import { QueryState } from '../administration/query-state';
import { formatPesos } from '../crm/labels';
import { NewRecord } from '../finance/ledger-ui';
import { usePermissions } from '../session/permissions';
import { CompleteTask, EditFileEntry } from './employee-checklists';
import { useHrAction, useHrQuery } from './hr-queries';
import { HrForm } from './hr-form';

export function EmployeePanel({ id }: { readonly id: string }): JSX.Element {
  const query = useHrQuery(`/v1/hr/employees/${id}`, employeeDetailResponseSchema);
  return (
    <QueryState query={query} loadingLabel="Cargando ficha laboral">
      {(record) => <Record record={record} />}
    </QueryState>
  );
}

function Record({ record }: { readonly record: EmployeeDetail }): JSX.Element {
  const employee = record.employee;
  const { can, canAll } = usePermissions();
  const canManage = can('hr.employee.manage');
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={employee.name}
        description={`${employee.position.name} · ${EMPLOYEE_STATUS[employee.status]}`}
      />
      <p>
        Fecha de ingreso {formatDate(employee.hire_date)}
        {record.email === null ? null : ` · ${record.email}`}
      </p>
      {record.contract === null ? null : <Contract record={record} contract={record.contract} />}
      <FileHistory record={record} allowed={canManage && canAll('hr.file.read')} />
      <Onboarding record={record} allowed={canManage} />
    </div>
  );
}

function FileHistory(props: {
  readonly record: EmployeeDetail;
  readonly allowed: boolean;
}): JSX.Element | null {
  if (props.record.file === null) return null;
  return (
    <section aria-labelledby="file-title" className="space-y-3">
      <h2 id="file-title" className="text-lg font-semibold">
        Historia laboral
      </h2>
      <ul className="divide-y rounded-md border">
        {props.record.file.map((entry) => (
          <li key={entry.item} className="p-3">
            <strong>{FILE_ITEMS[entry.item]}</strong> · {FILE_ITEM_STATUS[entry.status]}
            {entry.note === null ? null : <p className="mt-1 text-sm">{entry.note}</p>}
            <EditFileEntry
              employeeId={props.record.employee.id}
              entry={entry}
              allowed={props.allowed}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Onboarding(props: {
  readonly record: EmployeeDetail;
  readonly allowed: boolean;
}): JSX.Element | null {
  if (props.record.onboarding.length === 0) return null;
  return (
    <section aria-labelledby="onboarding-title" className="space-y-3">
      <h2 id="onboarding-title" className="text-lg font-semibold">
        Inducción
      </h2>
      <ul className="divide-y rounded-md border">
        {props.record.onboarding.map((task) => (
          <li key={task.id} className="p-3">
            <strong>{task.title}</strong>
            <p className="text-sm">
              {task.done_on === null
                ? `Pendiente · vence ${formatDate(task.due_on)}`
                : `Realizada el ${formatDate(task.done_on)}`}
              {task.responsible === null ? null : ` · Responsable: ${task.responsible.name}`}
            </p>
            <CompleteTask task={task} allowed={props.allowed} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Contract(props: {
  readonly record: EmployeeDetail;
  readonly contract: NonNullable<EmployeeDetail['contract']>;
}): JSX.Element {
  return (
    <section aria-labelledby="contract-title" className="space-y-3">
      <h2 id="contract-title" className="text-lg font-semibold">
        Contrato laboral
      </h2>
      <p>
        {EMPLOYMENT_CONTRACT_STATUS[props.contract.status]}
        {props.contract.envelope_code === null ? null : ` · ${props.contract.envelope_code}`}
      </p>
      <p>
        Banda salarial {props.contract.salary_band_label}
        {props.contract.salary === null ? null : ` · ${formatPesos(props.contract.salary)}`}
      </p>
      <ContractActions record={props.record} contract={props.contract} />
    </section>
  );
}

/** Abre el enlace de descarga firmado en la misma pestaña. */
function openContract({ url }: { readonly url: string }): void {
  window.open(url, '_self');
}

function ContractActions(props: {
  readonly record: EmployeeDetail;
  readonly contract: NonNullable<EmployeeDetail['contract']>;
}): JSX.Element {
  const api = useApiClient();
  const { can } = usePermissions();
  const path = `/v1/hr/employees/${props.record.employee.id}`;
  const version = props.record.employee.version;
  const download = useHrAction<undefined, { url: string }>(
    (_, csrfToken) =>
      api.post(`${path}/contract/download-link`, {
        body: {},
        csrfToken,
        schema: downloadLinkResponseSchema,
      }),
    openContract,
  );
  const sign = useHrAction<undefined>((_, csrfToken) =>
    api.post(`${path}/contract/actions/sign`, { csrfToken, body: { accept: true } }),
  );
  const activate = useHrAction<undefined>((_, csrfToken) =>
    api.post(`${path}/actions/activate`, { body: {}, csrfToken, version }),
  );
  const canManage = can('hr.employee.manage') && props.record.employee.status === 'pending';
  return (
    <>
      <ContractButtons
        path={path}
        version={version}
        contract={props.contract}
        canManage={canManage}
        download={download}
        sign={sign}
        activate={activate}
      />
      <ContractFeedback actions={[download, sign, activate]} />
    </>
  );
}

function ContractButtons(props: {
  readonly path: string;
  readonly version: number;
  readonly contract: NonNullable<EmployeeDetail['contract']>;
  readonly canManage: boolean;
  readonly download: AdminAction<undefined, { url: string }>;
  readonly sign: AdminAction<undefined, unknown>;
  readonly activate: AdminAction<undefined, unknown>;
}): JSX.Element {
  return (
    <div className="flex flex-wrap gap-3">
      <CancelHiring
        path={props.path}
        version={props.version}
        allowed={props.canManage && props.contract.status === 'in_signature'}
      />
      {props.contract.document_available ? (
        <ActionButton label="Abrir contrato" variant="outline" action={props.download} />
      ) : null}
      {props.contract.my_turn ? (
        <ActionButton label="Confirmar y firmar por la empresa" action={props.sign} />
      ) : null}
      {props.canManage && props.contract.status === 'signed' ? (
        <ActionButton label="Vincular colaborador" action={props.activate} />
      ) : null}
    </div>
  );
}

function ActionButton(props: {
  readonly label: string;
  readonly variant?: 'outline';
  readonly action: AdminAction<undefined, unknown>;
}): JSX.Element {
  return (
    <Button
      type="button"
      variant={props.variant}
      disabled={props.action.pending}
      onClick={() => {
        props.action.execute(undefined);
      }}
    >
      {props.label}
    </Button>
  );
}

function CancelHiring(props: {
  readonly path: string;
  readonly version: number;
  readonly allowed: boolean;
}): JSX.Element {
  const api = useApiClient();
  return (
    <NewRecord
      allowed={props.allowed}
      label="Anular vinculación"
      title="Anular vinculación"
      description="Puede preparar otro contrato para la misma candidatura."
    >
      {(close) => (
        <HrForm
          fields={[{ key: 'reason', label: 'Motivo' }]}
          schema={cancelHiringSchema}
          run={(body, csrfToken) =>
            api.post(`${props.path}/actions/cancel-hiring`, {
              body,
              csrfToken,
              version: props.version,
            })
          }
          label="Anular vinculación"
          onDone={close}
        />
      )}
    </NewRecord>
  );
}

function ContractFeedback(props: {
  readonly actions: readonly AdminAction<undefined, unknown>[];
}): JSX.Element {
  return (
    <>
      {props.actions.map((action, index) =>
        action.error === null ? null : <FormError key={index} error={action.error} />,
      )}
      {props.actions.map((action, index) => (
        <Fragment key={index}>{action.dialog}</Fragment>
      ))}
    </>
  );
}
