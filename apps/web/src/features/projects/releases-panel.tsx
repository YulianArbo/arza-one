'use client';

import {
  downloadLinkResponseSchema,
  type ProjectDetail,
  type ProjectRelease,
} from '@arza/contracts';
import { Button, EmptyState, SimpleTable, TableCell, TableRow } from '@arza/ui';
import { Rocket } from 'lucide-react';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { save } from '../audit/audit-export-button';
import { MissingFileHint, usePdfOptions } from '../contracts/signature-form';
import { RecordDialog } from '../organization/record-dialog';
import {
  ChoiceFields,
  DialogForm,
  Fields,
  optionsOf,
  useDialogForm,
  type ChoiceSpec,
  type FieldSpec,
} from './form-bits';
import { DELIVERY_ENVIRONMENTS } from './labels';
import { useProjectAction, useReleases } from './queries';

// Liberaciones del proyecto (B27, PR-TEC-003 Pruebas y Liberación): cada versión publicada, con su
// ambiente, fecha, notas y el informe de pruebas en PDF, que es obligatorio. No se editan.

interface Props {
  readonly project: ProjectDetail;
}

interface Values {
  readonly version: string;
  readonly environment: string;
  readonly releasedOn: string;
  readonly notes: string;
  readonly fileId: string;
}

const TEXTS: readonly FieldSpec<'version' | 'releasedOn' | 'notes'>[] = [
  { key: 'version', field: 'version_label', id: 'liberacion-version', label: 'Versión' },
  {
    key: 'releasedOn',
    field: 'released_on',
    id: 'liberacion-fecha',
    label: 'Fecha de la liberación',
    type: 'date',
  },
  { key: 'notes', field: 'notes', id: 'liberacion-notas', label: 'Qué cambia' },
];

function choicesOf(pdfs: ChoiceSpec<'fileId'>['options']): ChoiceSpec<keyof Values>[] {
  return [
    {
      key: 'environment',
      field: 'environment',
      id: 'liberacion-ambiente',
      label: 'Ambiente',
      options: optionsOf(DELIVERY_ENVIRONMENTS),
    },
    {
      key: 'fileId',
      field: 'test_report_file_id',
      id: 'liberacion-informe',
      label: 'Informe de pruebas (PDF)',
      options: pdfs,
    },
  ];
}

function problemsOf(values: Values): Record<string, string> {
  const found: Record<string, string> = {};
  if (values.version.trim() === '') found['version_label'] = 'Escriba la versión, como 1.2.0.';
  if (values.releasedOn === '') found['released_on'] = 'Elija la fecha.';
  if (values.notes.trim().length < 3) found['notes'] = 'Escriba qué cambia en esta versión.';
  if (values.fileId === '') found['test_report_file_id'] = 'Elija el informe de pruebas en PDF.';
  return found;
}

function bodyOf(values: Values): object {
  return {
    version_label: values.version.trim(),
    environment: values.environment,
    released_on: values.releasedOn,
    notes: values.notes.trim(),
    test_report_file_id: values.fileId,
  };
}

const EMPTY: Values = { version: '', environment: 'test', releasedOn: '', notes: '', fileId: '' };

function ReleaseForm(props: Props & { readonly onDone: () => void }): JSX.Element {
  const api = useApiClient();
  const choices = choicesOf(usePdfOptions());
  const create = useProjectAction<object>(async (body, csrfToken) => {
    await api.post(`/v1/projects/${props.project.id}/releases`, { body, csrfToken });
  }, props.onDone);
  const form = useDialogForm(EMPTY, problemsOf, (values) => {
    create.execute(bodyOf(values));
  });
  const change = (key: keyof Values, value: string): void => {
    form.set({ [key]: value });
  };
  return (
    <DialogForm
      problems={form.problems}
      fields={[...TEXTS, ...choices]}
      action={create}
      submitLabel="Registrar la liberación"
      onSubmit={form.submit}
    >
      <Fields specs={TEXTS} values={form.values} problems={form.problems} onChange={change} />
      <ChoiceFields
        specs={choices}
        values={form.values}
        problems={form.problems}
        onChange={change}
      />
      <MissingFileHint />
    </DialogForm>
  );
}

function ReportButton(props: Props & { readonly release: ProjectRelease }): JSX.Element {
  const api = useApiClient();
  const path = `/v1/projects/${props.project.id}/releases/${props.release.id}/report-link`;
  const download = useProjectAction<undefined>(async (_args, csrfToken) => {
    const link = await api.post(path, { body: {}, csrfToken, schema: downloadLinkResponseSchema });
    save({
      fileName: props.release.test_report?.file_name ?? 'informe-de-pruebas.pdf',
      content: await api.fetchFile(link.url),
    });
  });
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={download.pending}
        aria-label={`Descargar el informe de pruebas de la versión ${props.release.version_label}`}
        onClick={() => {
          download.execute(undefined);
        }}
      >
        Informe de pruebas
      </Button>
      {download.error === null ? null : <FormError error={download.error} />}
      {download.dialog}
    </>
  );
}

function ReleasesTable(props: Props & { readonly rows: readonly ProjectRelease[] }): JSX.Element {
  if (props.rows.length === 0) {
    return (
      <EmptyState
        icon={<Rocket />}
        title="Sin liberaciones"
        description="Cada versión publicada queda aquí con su informe de pruebas."
      />
    );
  }
  return (
    <SimpleTable
      caption="Versiones liberadas"
      scrollLabel="Liberaciones; desplácese a los lados para ver todas las columnas"
      headers={['Versión', 'Ambiente', 'Fecha', 'Qué cambia', 'Liberó', 'Informe']}
    >
      {props.rows.map((release) => (
        <TableRow key={release.id}>
          <TableCell>{release.version_label}</TableCell>
          <TableCell>{DELIVERY_ENVIRONMENTS[release.environment]}</TableCell>
          <TableCell>{formatDate(release.released_on)}</TableCell>
          <TableCell>{release.notes}</TableCell>
          <TableCell>{release.released_by?.name ?? '—'}</TableCell>
          <TableCell>
            {release.test_report === null ? null : (
              <ReportButton project={props.project} release={release} />
            )}
          </TableCell>
        </TableRow>
      ))}
    </SimpleTable>
  );
}

export function ReleasesPanel({ project }: Props): JSX.Element {
  const releases = useReleases(project.id);
  return (
    <div className="flex flex-col gap-4">
      {project.can.manage_releases && project.status !== 'closed' ? (
        <div>
          <RecordDialog
            triggerLabel="Registrar una liberación"
            title="Nueva liberación"
            description="El informe de pruebas en PDF es obligatorio (PR-TEC-003)."
          >
            {(close) => <ReleaseForm project={project} onDone={close} />}
          </RecordDialog>
        </div>
      ) : null}
      <QueryState query={releases} loadingLabel="Cargando las liberaciones">
        {(data) => <ReleasesTable project={project} rows={data.data} />}
      </QueryState>
    </div>
  );
}
