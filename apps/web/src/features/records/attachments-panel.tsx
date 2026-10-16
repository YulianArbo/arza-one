'use client';

import type { Attachment, RecordRef } from '@arza/contracts';
import { Button, EmptyState, TableCell, TableRow } from '@arza/ui';
import { Paperclip } from 'lucide-react';
import Link from 'next/link';
import { useState, type JSX, type SubmitEvent } from 'react';

import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { SelectField } from '../administration/select-field';
import { SimpleTable } from '../administration/simple-table';
import { DownloadButton } from '../files/file-list';
import { formatSize } from '../files/labels';
import { useFiles } from '../files/queries';
import { TextInput } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { personName } from '../workflows/labels';
import {
  useAddAttachment,
  useAttachmentLink,
  useAttachments,
  useRemoveAttachment,
} from './queries';

const FILES_PATH = '/app/archivos';

function AttachmentRow(props: {
  readonly attachment: Attachment;
  readonly onRemove: (id: string) => void;
  readonly pending: boolean;
}): JSX.Element {
  const { attachment } = props;
  const requestLink = useAttachmentLink();
  return (
    <TableRow>
      <TableCell>
        <span className="font-medium">{attachment.label}</span>
        <p className="text-xs text-muted-foreground">
          {attachment.file.file_name} · {formatSize(attachment.file.size_bytes)}
        </p>
      </TableCell>
      <TableCell>
        {personName(attachment.created_by)} · {formatDateTime(attachment.created_at)}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-2">
          <DownloadButton requestLink={async () => requestLink(attachment.id)} />
          {attachment.can_delete ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={props.pending}
              onClick={() => {
                props.onRemove(attachment.id);
              }}
            >
              Retirar
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

/** Archivos disponibles para elegir; la API revisa además que sean de la persona. */
function useFileOptions(): { readonly value: string; readonly label: string }[] {
  const files = useFiles();
  const available = (files.data?.data ?? []).filter((file) => file.status === 'available');
  return [
    { value: '', label: 'Elija un archivo' },
    ...available.map((file) => ({ value: file.id, label: file.file_name })),
  ];
}

function MissingFileHint(): JSX.Element {
  return (
    <p className="text-sm">
      ¿No está el archivo?{' '}
      <Link className="text-primary underline" href={FILES_PATH}>
        Súbalo en Archivos
      </Link>{' '}
      y vuelva aquí.
    </p>
  );
}

function AttachFields(props: {
  readonly fileId: string;
  readonly label: string;
  readonly onFile: (id: string) => void;
  readonly onLabel: (label: string) => void;
}): JSX.Element {
  const options = useFileOptions();
  return (
    <>
      <SelectField
        id="adjunto-archivo"
        label="Archivo"
        hint="Solo los que usted subió y ya pasaron la revisión del antivirus."
        options={options}
        value={props.fileId}
        onChange={(event) => {
          props.onFile(event.target.value);
        }}
      />
      <TextInput
        id="adjunto-etiqueta"
        label="Qué es"
        hint="Por ejemplo: RUT 2026, cámara de comercio."
        maxLength={120}
        value={props.label}
        onValue={props.onLabel}
      />
    </>
  );
}

/** Adjuntar uno de los archivos que la persona subió y que ya pasaron el antivirus. */
function AttachForm({ record }: { readonly record: RecordRef }): JSX.Element {
  const [fileId, setFileId] = useState('');
  const [label, setLabel] = useState('');
  const add = useAddAttachment(record, () => {
    setFileId('');
    setLabel('');
  });
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    add.execute({ ...record, file_id: fileId, label: label.trim() });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-label="Adjuntar un archivo">
      <AttachFields fileId={fileId} label={label} onFile={setFileId} onLabel={setLabel} />
      <MissingFileHint />
      {add.error === null ? null : <FormError error={add.error} />}
      <SubmitButton
        label="Adjuntar"
        pendingLabel="Adjuntando…"
        pending={add.pending}
        done={fileId === '' || label.trim() === ''}
        className="self-start"
      />
      {add.dialog}
    </form>
  );
}

/** Adjuntos de un registro; quien puede escribir y usa Archivos puede adjuntar los suyos. */
export function AttachmentsPanel(props: {
  readonly record: RecordRef;
  readonly canWrite: boolean;
}): JSX.Element {
  const attachments = useAttachments(props.record);
  const remove = useRemoveAttachment(props.record);
  const usesFiles = usePermissions().can('doc.document.read');
  return (
    <section aria-labelledby="adjuntos-titulo" className="flex flex-col gap-3">
      <h2 id="adjuntos-titulo" className="text-lg font-semibold">
        Adjuntos
      </h2>
      <QueryState query={attachments} loadingLabel="Cargando los adjuntos">
        {(data) =>
          data.items.length === 0 ? (
            <EmptyState
              icon={<Paperclip />}
              title="Sin adjuntos"
              description="Este registro todavía no tiene archivos adjuntos."
            />
          ) : (
            <SimpleTable headers={['Adjunto', 'Adjuntado por', '']}>
              {data.items.map((attachment) => (
                <AttachmentRow
                  key={attachment.id}
                  attachment={attachment}
                  onRemove={remove.execute}
                  pending={remove.pending}
                />
              ))}
            </SimpleTable>
          )
        }
      </QueryState>
      {remove.error === null ? null : <FormError error={remove.error} />}
      {remove.dialog}
      {props.canWrite && usesFiles ? <AttachForm record={props.record} /> : null}
    </section>
  );
}
