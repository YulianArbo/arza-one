'use client';

import {
  completeOnboardingTaskSchema,
  FILE_ITEMS,
  FILE_ITEM_STATUS,
  updateFileEntrySchema,
  type FileEntry,
  type FileListResponse,
  type OnboardingTask,
} from '@arza/contracts';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { QueryState } from '../administration/query-state';
import { bogotaToday } from '../crm/labels';
import { useFiles } from '../files/queries';
import { NewRecord } from '../finance/ledger-ui';
import { HrForm, type HrField } from './hr-form';

/** Texto opcional del formulario: vacío viaja como nulo. */
function optionalText(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}

/** El soporte solo se envía cuando el estado queda como recibido. */
function fileEntryBody(values: Record<string, string>) {
  return {
    ...values,
    note: optionalText(values['note']),
    file_id: values['status'] === 'received' ? optionalText(values['file_id']) : null,
  };
}

/** Soportes disponibles y, si existe, el que la ficha ya tiene sin volver a subirlo. */
function supportOptions(
  files: FileListResponse['data'],
  currentId: string | null,
): readonly { readonly value: string; readonly label: string }[] {
  const options = files
    .filter(({ status }) => status === 'available')
    .map(({ id, file_name }) => ({ value: id, label: file_name }));
  if (currentId !== null && !options.some(({ value }) => value === currentId)) {
    options.unshift({ value: currentId, label: 'Conservar el soporte actual' });
  }
  return options;
}

function fileEntryFields(
  entry: FileEntry,
  options: readonly { readonly value: string; readonly label: string }[],
): readonly HrField[] {
  return [
    {
      key: 'status',
      label: 'Estado',
      value: entry.status,
      options: Object.entries(FILE_ITEM_STATUS).map(([value, label]) => ({ value, label })),
    },
    { key: 'note', label: 'Observación', value: entry.note ?? '' },
    { key: 'file_id', label: 'Soporte', value: entry.file_id ?? '', options },
  ];
}

export function EditFileEntry({
  employeeId,
  entry,
  allowed,
}: {
  readonly employeeId: string;
  readonly entry: FileEntry;
  readonly allowed: boolean;
}): JSX.Element {
  return (
    <NewRecord
      allowed={allowed && entry.item !== 'signed_contract' && entry.item !== 'data_authorization'}
      label={`Editar ${FILE_ITEMS[entry.item]}`}
      title={FILE_ITEMS[entry.item]}
      description="Registre el estado y una observación si hace falta."
    >
      {(close) => <FileEntryForm employeeId={employeeId} entry={entry} onDone={close} />}
    </NewRecord>
  );
}

function FileEntryForm({
  employeeId,
  entry,
  onDone,
}: {
  readonly employeeId: string;
  readonly entry: FileEntry;
  readonly onDone: () => void;
}): JSX.Element {
  const api = useApiClient();
  const files = useFiles();
  return (
    <QueryState query={files} loadingLabel="Cargando soportes">
      {({ data }) => (
        <HrForm
          fields={fileEntryFields(entry, supportOptions(data, entry.file_id))}
          schema={updateFileEntrySchema}
          prepare={fileEntryBody}
          run={(body, csrfToken) =>
            api.put(`/v1/hr/employees/${employeeId}/file/${entry.item}`, {
              body,
              csrfToken,
              version: entry.version,
            })
          }
          label="Guardar estado"
          onDone={onDone}
        />
      )}
    </QueryState>
  );
}

export function CompleteTask({
  task,
  allowed,
}: {
  readonly task: OnboardingTask;
  readonly allowed: boolean;
}): JSX.Element {
  const api = useApiClient();
  return (
    <NewRecord
      allowed={allowed && task.done_on === null}
      label={`Completar ${task.title}`}
      title="Completar tarea de inducción"
      description={task.title}
    >
      {(close) => (
        <HrForm
          fields={[
            { key: 'done_on', label: 'Fecha de realización', type: 'date', value: bogotaToday() },
            { key: 'note', label: 'Observación' },
          ]}
          schema={completeOnboardingTaskSchema}
          prepare={(values) => ({ ...values, note: optionalText(values['note']) })}
          run={(body, csrfToken) =>
            api.post(
              `/v1/hr/employees/${task.employee.id}/onboarding/${task.id}/actions/complete`,
              { body, csrfToken, version: task.version },
            )
          }
          label="Completar tarea"
          onDone={close}
        />
      )}
    </NewRecord>
  );
}
