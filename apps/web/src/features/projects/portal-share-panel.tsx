'use client';

import type { ProjectDetail, SharedFile, SharedFileList } from '@arza/contracts';
import { Alert, AlertDescription, Button, Card, CardContent, EmptyState } from '@arza/ui';
import { Share2 } from 'lucide-react';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { MissingFileHint } from '../contracts/signature-form';
import { useFiles } from '../files/queries';
import { RecordDialog } from '../organization/record-dialog';
import {
  ChoiceFields,
  DialogForm,
  Fields,
  summaryOf,
  useDialogForm,
  type ChoiceSpec,
  type FieldSpec,
} from './form-bits';
import { useProjectAction, useSharedFiles } from './queries';

// Lo que el cliente ve de este proyecto en su portal (B30, decisiones 2 y 5): el líder decide si
// el proyecto se ve allí (desde que inicia) y comparte a propósito los archivos que el cliente
// puede descargar. Nada se comparte por defecto. Dejar de compartir no borra el archivo.

interface Props {
  readonly project: ProjectDetail;
}

type ShareKey = 'fileId' | 'title';

const TEXTS: readonly FieldSpec<ShareKey>[] = [
  {
    key: 'title',
    field: 'title',
    id: 'compartir-titulo',
    label: 'Cómo lo verá el cliente',
    hint: 'Por ejemplo: Manual de usuario, versión 1.0.',
  },
];

function useFileChoices(): ChoiceSpec<ShareKey>[] {
  const files = (useFiles().data?.data ?? []).filter((file) => file.status === 'available');
  return [
    {
      key: 'fileId',
      field: 'file_id',
      id: 'compartir-archivo',
      label: 'Archivo',
      options: [
        {
          value: '',
          label: files.length === 0 ? 'No tiene archivos disponibles' : 'Elija el archivo',
        },
        ...files.map((file) => ({ value: file.id, label: file.file_name })),
      ],
    },
  ];
}

function shareProblems(values: Readonly<Record<ShareKey, string>>): Record<string, string> {
  const found: Record<string, string> = {};
  if (values.fileId === '') found['file_id'] = 'Elija el archivo.';
  if (values.title.trim().length < 3) found['title'] = 'Escriba cómo lo verá el cliente.';
  return found;
}

function ShareForm(props: Props & { readonly close: () => void }): JSX.Element {
  const api = useApiClient();
  const choices = useFileChoices();
  const share = useProjectAction<object>(async (body, csrfToken) => {
    await api.post(`/v1/projects/${props.project.id}/shared-files`, { body, csrfToken });
  }, props.close);
  const form = useDialogForm({ fileId: '', title: '' }, shareProblems, (values) => {
    share.execute({ file_id: values.fileId, title: values.title.trim() });
  });
  const change = (key: ShareKey, value: string): void => {
    form.set({ [key]: value });
  };
  return (
    <DialogForm
      problems={form.problems}
      fields={[...summaryOf(choices), ...summaryOf(TEXTS)]}
      action={share}
      submitLabel="Compartir"
      onSubmit={form.submit}
    >
      <ChoiceFields
        specs={choices}
        values={form.values}
        problems={form.problems}
        onChange={change}
      />
      <MissingFileHint />
      <Fields specs={TEXTS} values={form.values} problems={form.problems} onChange={change} />
    </DialogForm>
  );
}

function Visibility(props: Props & { readonly visible: boolean }): JSX.Element {
  const api = useApiClient();
  const toggle = useProjectAction<boolean>(async (visible, csrfToken) => {
    await api.put(`/v1/projects/${props.project.id}/portal`, {
      body: { visible },
      version: props.project.version,
      csrfToken,
    });
  });
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <p className="text-sm">
          {props.visible
            ? 'El cliente ve este proyecto en su portal desde que inicia: avance, hitos y entregables. Nunca horas, dinero ni notas del equipo.'
            : 'Este proyecto está oculto: el cliente no lo ve en su portal.'}
        </p>
        {toggle.error === null ? null : <FormError error={toggle.error} />}
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={toggle.pending}
            onClick={() => {
              toggle.execute(!props.visible);
            }}
          >
            {props.visible ? 'Ocultar en el portal' : 'Mostrar en el portal'}
          </Button>
        </div>
        {toggle.dialog}
      </CardContent>
    </Card>
  );
}

function SharedRow(props: Props & { readonly file: SharedFile; readonly canShare: boolean }) {
  const api = useApiClient();
  const remove = useProjectAction<string>(async (id, csrfToken) => {
    await api.delete(`/v1/projects/${props.project.id}/shared-files/${id}`, { csrfToken });
  });
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span>
        <span className="font-medium">{props.file.title}</span>
        <span className="block text-sm text-muted-foreground">
          {props.file.shared_by?.name ?? '—'} · {formatDateTime(props.file.shared_at)}
        </span>
        {remove.error === null ? null : <FormError error={remove.error} />}
      </span>
      {props.canShare ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={remove.pending}
          aria-label={`Dejar de compartir ${props.file.title}`}
          onClick={() => {
            remove.execute(props.file.id);
          }}
        >
          Dejar de compartir
        </Button>
      ) : null}
      {remove.dialog}
    </li>
  );
}

function SharedList(props: Props & { readonly data: SharedFileList }): JSX.Element {
  if (props.data.data.length === 0) {
    return (
      <EmptyState
        icon={<Share2 />}
        title="Nada compartido todavía"
        description="Los contratos y actas firmados el cliente ya los ve; aquí comparte otros archivos."
      />
    );
  }
  return (
    <Card>
      <CardContent className="p-4">
        <ul className="flex flex-col divide-y" aria-label="Archivos compartidos con el cliente">
          {props.data.data.map((file) => (
            <SharedRow
              key={file.id}
              project={props.project}
              file={file}
              canShare={props.data.can_share}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ShareTools(props: Props & { readonly data: SharedFileList }): JSX.Element | null {
  if (!props.data.can_share) {
    return props.data.visible ? null : (
      <Alert tone="info">
        <AlertDescription>Este proyecto está oculto en el portal del cliente.</AlertDescription>
      </Alert>
    );
  }
  return (
    <>
      <Visibility project={props.project} visible={props.data.visible} />
      <div>
        <RecordDialog
          triggerLabel="Compartir un archivo"
          variant="outline"
          title="Compartir un archivo con el cliente"
          description="El cliente lo verá y podrá descargarlo en Documentos de su portal."
        >
          {(close) => <ShareForm project={props.project} close={close} />}
        </RecordDialog>
      </div>
    </>
  );
}

export function PortalSharePanel({ project }: Props): JSX.Element {
  const shared = useSharedFiles(project.id);
  return (
    <QueryState query={shared} loadingLabel="Cargando lo compartido con el cliente">
      {(data) => (
        <div className="flex flex-col gap-4">
          <ShareTools project={project} data={data} />
          <SharedList project={project} data={data} />
        </div>
      )}
    </QueryState>
  );
}
