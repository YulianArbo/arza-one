'use client';

import { FORM_RECORD_STATUSES, type FormRecordSummary } from '@arza/contracts';
import { Badge, buttonVariants, EmptyState, TableCell, TableRow } from '@arza/ui';
import { ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { useState, type JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { SelectField } from '../administration/select-field';
import { SimpleTable } from '../administration/simple-table';
import { FORMS_PATH, RECORD_STATUS_TONES, recordPath } from './labels';
import { useFormRecords, useFormTemplates } from './queries';

// Registros diligenciados (B20): código, formato y versión, estado y quién lo diligenció. Quien
// solo ve lo propio ve los que diligenció; los confidenciales, solo quien debe.

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  ...Object.entries(FORM_RECORD_STATUSES).map(([value, label]) => ({ value, label })),
];

function RecordRow({ record }: { readonly record: FormRecordSummary }): JSX.Element {
  return (
    <TableRow>
      <TableCell className="font-medium">
        <Link href={recordPath(record.id)} className="text-primary hover:underline">
          {record.code}
        </Link>
      </TableCell>
      <TableCell>
        <p>{record.template.name}</p>
        <p className="text-xs text-muted-foreground">Versión {record.template.form_version}</p>
      </TableCell>
      <TableCell>{record.entity?.label ?? '—'}</TableCell>
      <TableCell>
        <Badge tone={RECORD_STATUS_TONES[record.status]}>
          {FORM_RECORD_STATUSES[record.status]}
        </Badge>
      </TableCell>
      <TableCell>
        <p>{record.created_by?.name ?? 'ARZA ONE'}</p>
        <p className="text-xs text-muted-foreground">{formatDateTime(record.created_at)}</p>
      </TableCell>
    </TableRow>
  );
}

function Records({ records }: { readonly records: readonly FormRecordSummary[] }): JSX.Element {
  if (records.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList />}
        title="No hay registros"
        description="Diligencie un formato desde la lista de formatos digitales."
      />
    );
  }
  return (
    <SimpleTable headers={['Código', 'Formato', 'Pertenece a', 'Estado', 'Diligenció']}>
      {records.map((record) => (
        <RecordRow key={record.id} record={record} />
      ))}
    </SimpleTable>
  );
}

function Filters(props: {
  readonly code: string;
  readonly status: string;
  readonly codes: readonly string[];
  readonly onCode: (code: string) => void;
  readonly onStatus: (status: string) => void;
}): JSX.Element {
  const codeOptions = [
    { value: '', label: 'Todos' },
    ...props.codes.map((c) => ({ value: c, label: c })),
  ];
  return (
    <div className="grid max-w-xl gap-4 sm:grid-cols-2">
      <SelectField
        id="registros-formato"
        label="Formato"
        value={props.code}
        options={codeOptions}
        onChange={(event) => {
          props.onCode(event.target.value);
        }}
      />
      <SelectField
        id="registros-estado"
        label="Estado"
        value={props.status}
        options={STATUS_OPTIONS}
        onChange={(event) => {
          props.onStatus(event.target.value);
        }}
      />
    </div>
  );
}

export function RecordList(): JSX.Element {
  const [status, setStatus] = useState('');
  const [code, setCode] = useState('');
  const templates = useFormTemplates().data?.data ?? [];
  const codes = [...new Set(templates.map((t) => t.code))].sort();
  const records = useFormRecords(code === '' ? { status } : { status, templateCode: code });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Registros diligenciados"
        description="Cada registro conserva la versión del formato con que se creó. Terminado, se descarga su PDF institucional."
        action={
          <Link href={FORMS_PATH} className={buttonVariants({ variant: 'outline' })}>
            Formatos digitales
          </Link>
        }
      />
      <Filters code={code} status={status} codes={codes} onCode={setCode} onStatus={setStatus} />
      <QueryState query={records} loadingLabel="Cargando los registros">
        {(data) => <Records records={data.data} />}
      </QueryState>
    </div>
  );
}
