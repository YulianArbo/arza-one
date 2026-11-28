'use client';

import { FORM_RECORD_STATUSES, type FormRecord } from '@arza/contracts';
import { Badge, Button } from '@arza/ui';
import Link from 'next/link';
import { useState, type JSX, type SubmitEvent } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { PageHeader } from '../../components/app-shell/page-header';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { DownloadButton } from '../files/file-list';
import { RecordDialog } from '../organization/record-dialog';
import { CommentField } from '../workflows/workflow-actions';
import { requestPath } from '../documents/labels';
import { partyPath } from '../parties/labels';
import { FormReadout, FormSheet, problemsOf, type FormValues } from './form-sheet';
import { PDF_STATUS_LABELS, RECORDS_PATH, RECORD_STATUS_TONES } from './labels';
import { useFormRecord, useRecordPdfLink, useRecordStep, useSaveFormRecord } from './queries';

// Ficha de un registro diligenciado (B20): con los campos de la versión del formato con que se
// creó. Quien lo diligencia guarda su borrador y lo envía; quien atiende la aprobación lo aprueba
// o lo devuelve con el motivo; terminado, se descarga su PDF institucional.

function Facts({ record }: { readonly record: FormRecord }): JSX.Element {
  const facts: readonly (readonly [string, string])[] = [
    ['Formato', `${record.template.code} · versión ${String(record.template.form_version)}`],
    ['Diligenció', `${record.created_by?.name ?? '—'} el ${formatDateTime(record.created_at)}`],
    ['Paso actual', record.step ?? '—'],
    [
      'Aprobó',
      record.approved_by === null
        ? '—'
        : `${record.approved_by.name} el ${formatDateTime(record.approved_at)}`,
    ],
    ['Clasificación', record.classification === 'confidential' ? 'Confidencial' : 'Interno'],
    ['PDF', PDF_STATUS_LABELS[record.pdf_status]],
  ];
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-3">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EntityLink({ record }: { readonly record: FormRecord }): JSX.Element | null {
  const { entity } = record;
  if (entity === null) return null;
  const href =
    entity.type === 'doc_change_request'
      ? requestPath(entity.id)
      : entity.type === 'party'
        ? partyPath(entity.id)
        : null;
  return (
    <p className="text-sm">
      Pertenece a:{' '}
      {href === null ? (
        <span className="font-medium">{entity.label}</span>
      ) : (
        <Link href={href} className="text-primary hover:underline">
          {entity.label}
        </Link>
      )}
    </p>
  );
}

function DraftButtons(props: {
  readonly saving: boolean;
  readonly sending: boolean;
  readonly dirty: boolean;
  readonly onSend: () => void;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SubmitButton label="Guardar borrador" pendingLabel="Guardando…" pending={props.saving} />
      <Button
        type="button"
        variant="outline"
        disabled={props.dirty || props.sending}
        onClick={props.onSend}
      >
        {props.sending ? 'Enviando…' : 'Enviar'}
      </Button>
      {props.dirty ? (
        <p className="text-xs text-muted-foreground">Guarde los cambios antes de enviar.</p>
      ) : null}
    </div>
  );
}

/** El borrador propio: guardar lo escrito y enviarlo cuando esté completo. */
function DraftEditor({ record }: { readonly record: FormRecord }): JSX.Element {
  const [values, setValues] = useState<FormValues>(record.data);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const save = useSaveFormRecord(() => {
    setDirty(false);
  });
  const step = useRecordStep();
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = problemsOf(record.definition, values, 'draft');
    setProblems(found);
    if (Object.keys(found).length === 0)
      save.execute({ id: record.id, version: record.version, data: values });
  };
  const send = (): void => {
    const found = problemsOf(record.definition, values, 'final');
    setProblems(found);
    if (Object.keys(found).length === 0)
      step.execute({ id: record.id, version: record.version, step: 'submit', comment: null });
  };
  return (
    <form noValidate onSubmit={submit} className="flex max-w-3xl flex-col gap-6">
      {save.error === null ? null : <FormError error={save.error} />}
      {step.error === null ? null : <FormError error={step.error} />}
      <FormSheet
        definition={record.definition}
        values={values}
        problems={problems}
        onChange={(next) => {
          setValues(next);
          setDirty(true);
        }}
      />
      <DraftButtons saving={save.pending} sending={step.pending} dirty={dirty} onSend={send} />
      {save.dialog}
      {step.dialog}
    </form>
  );
}

function RejectForm(props: {
  readonly record: FormRecord;
  readonly onDone: () => void;
}): JSX.Element {
  const [comment, setComment] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const action = useRecordStep(props.onDone);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const text = comment.trim();
    const invalid = text.length < 5 || text.length > 2000;
    setProblem(invalid ? 'Escriba el motivo (5 a 2000 caracteres).' : null);
    if (!invalid)
      action.execute({
        id: props.record.id,
        version: props.record.version,
        step: 'reject',
        comment: text,
      });
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {action.error === null ? null : <FormError error={action.error} />}
      <CommentField
        id="registro-motivo"
        label="Motivo"
        hint={problem ?? 'Lo verá quien diligenció el formato.'}
        value={comment}
        onChange={setComment}
      />
      <SubmitButton label="Devolver" pendingLabel="Guardando…" pending={action.pending} />
      {action.dialog}
    </form>
  );
}

function Decision({ record }: { readonly record: FormRecord }): JSX.Element | null {
  const approve = useRecordStep();
  if (!record.actions.includes('approve')) return null;
  return (
    <div className="flex flex-wrap items-start gap-2">
      <ConfirmActionButton
        label="Aprobar"
        title={`Aprobar: ${record.code}`}
        description="El registro queda terminado y se genera su PDF con el encabezado institucional."
        confirmLabel="Sí, aprobar"
        disabled={approve.pending}
        onConfirm={() => {
          approve.execute({
            id: record.id,
            version: record.version,
            step: 'approve',
            comment: null,
          });
        }}
      />
      <RecordDialog
        triggerLabel="Devolver"
        variant="outline"
        size="md"
        title={`Devolver: ${record.code}`}
        description="Vuelve al borrador de quien lo diligenció, con el motivo."
      >
        {(close) => <RejectForm record={record} onDone={close} />}
      </RecordDialog>
      {approve.error === null ? null : <FormError error={approve.error} />}
      {approve.dialog}
    </div>
  );
}

function RecordView({ record }: { readonly record: FormRecord }): JSX.Element {
  const requestLink = useRecordPdfLink();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${record.code} · ${record.template.name}`}
        description="Conserva siempre la versión del formato con que se creó."
        action={
          record.actions.includes('download') ? (
            <DownloadButton
              label="Descargar PDF"
              requestLink={async () => requestLink(record.id)}
            />
          ) : undefined
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={RECORD_STATUS_TONES[record.status]}>
          {FORM_RECORD_STATUSES[record.status]}
        </Badge>
        <Link href={RECORDS_PATH} className="text-sm text-primary hover:underline">
          Volver a los registros
        </Link>
      </div>
      <Facts record={record} />
      <EntityLink record={record} />
      {record.return_note === null || record.status !== 'draft' ? null : (
        <p className="text-sm" role="status">
          Devuelto para corregir: «{record.return_note}»
        </p>
      )}
      <Decision record={record} />
      {record.actions.includes('edit') ? (
        <DraftEditor record={record} />
      ) : (
        <FormReadout definition={record.definition} values={record.data} />
      )}
    </div>
  );
}

export function RecordDetail({ id }: { readonly id: string }): JSX.Element {
  const record = useFormRecord(id);
  return (
    <QueryState query={record} loadingLabel="Cargando el registro">
      {(data) => <RecordView key={`${data.id}-${String(data.version)}`} record={data} />}
    </QueryState>
  );
}
