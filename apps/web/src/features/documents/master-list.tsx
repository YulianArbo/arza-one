'use client';

import {
  documentStatusSchema,
  type DocumentStatus,
  type MasterListEntry,
  type MasterListQuery,
} from '@arza/contracts';
import { Badge, Button, EmptyState, TableCell, TableRow } from '@arza/ui';
import { Download, ListChecks } from 'lucide-react';
import Link from 'next/link';
import { useState, type JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { useApiClient } from '../../lib/api/api-provider';
import type { DownloadedFile } from '../../lib/api/api-client';
import { formatDate } from '../../lib/format/date-time';
import { FormError, FormSuccess } from '../access/form-alert';
import { useAdminAction } from '../administration/admin-action';
import { QueryState } from '../administration/query-state';
import { SelectField } from '../administration/select-field';
import { SimpleTable } from '../administration/simple-table';
import { save } from '../audit/audit-export-button';
import { useCatalog, useOrgUnits } from '../organization/queries';
import { TextInput } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { DOCUMENT_STATUS_LABELS, DOCUMENT_STATUS_TONES, documentPath } from './labels';
import { masterListFilters, useMasterList } from './sgc-queries';

// Listado Maestro en línea y exportable (B19, RE-SGC-001 y ficha 17.4): código, nombre, tipo,
// proceso, versión, fecha, estado y responsable de cada documento del SGC, siempre al día.

type Filters = Partial<Pick<MasterListQuery, 'process_id' | 'doc_type' | 'q'>> & {
  readonly status: DocumentStatus;
};

const STATUS_OPTIONS = Object.entries(DOCUMENT_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

interface FilterProps {
  readonly filters: Filters;
  readonly onChange: (filters: Filters) => void;
}

/** Proceso y tipo de documento. */
function OrgFilters({ filters, onChange }: FilterProps): JSX.Element {
  const processes = (useOrgUnits().data?.data ?? []).filter((unit) => unit.kind === 'process');
  const types = useCatalog('document_types').data?.items ?? [];
  return (
    <>
      <SelectField
        id="listado-proceso"
        label="Proceso"
        value={filters.process_id ?? ''}
        options={[
          { value: '', label: 'Todos' },
          ...processes.map((unit) => ({ value: unit.id, label: `${unit.code} · ${unit.name}` })),
        ]}
        onChange={(event) => {
          onChange({ ...filters, process_id: event.target.value });
        }}
      />
      <SelectField
        id="listado-tipo"
        label="Tipo"
        value={filters.doc_type ?? ''}
        options={[
          { value: '', label: 'Todos' },
          ...types.map((item) => ({ value: item.code, label: `${item.code} · ${item.label}` })),
        ]}
        onChange={(event) => {
          onChange({ ...filters, doc_type: event.target.value });
        }}
      />
    </>
  );
}

function FilterFields({ filters, onChange }: FilterProps): JSX.Element {
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <SelectField
        id="listado-estado"
        label="Estado"
        value={filters.status}
        options={STATUS_OPTIONS}
        onChange={(event) => {
          const status = documentStatusSchema.safeParse(event.target.value);
          if (status.success) onChange({ ...filters, status: status.data });
        }}
      />
      <OrgFilters filters={filters} onChange={onChange} />
      <TextInput
        id="listado-buscar"
        label="Buscar por código o nombre"
        value={filters.q ?? ''}
        onValue={(q) => {
          onChange({ ...filters, q });
        }}
      />
    </div>
  );
}

function ExportButton({ filters }: { readonly filters: Filters }): JSX.Element | null {
  const api = useApiClient();
  const action = useAdminAction<Filters, DownloadedFile>({
    run: (current, csrfToken) =>
      api.download('/v1/master-list/export', { body: masterListFilters(current), csrfToken }),
    invalidate: [],
    reason: 'Exportar el Listado Maestro queda en la auditoría.',
    onSuccess: save,
  });
  if (!usePermissions().can('doc.export')) return null;
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={action.pending}
        onClick={() => {
          action.execute(filters);
        }}
      >
        <Download aria-hidden="true" />
        {action.pending ? 'Exportando…' : 'Exportar'}
      </Button>
      <div aria-live="polite">
        {action.result === undefined ? null : (
          <FormSuccess message={`Descargamos el archivo ${action.result.fileName}.`} />
        )}
      </div>
      {action.error === null ? null : <FormError error={action.error} />}
      {action.dialog}
    </div>
  );
}

function EntryRow({ entry }: { readonly entry: MasterListEntry }): JSX.Element {
  return (
    <TableRow>
      <TableCell className="font-medium">
        <Link href={documentPath(entry.document_id)} className="text-primary hover:underline">
          {entry.code}
        </Link>
      </TableCell>
      <TableCell>{entry.title}</TableCell>
      <TableCell>{entry.doc_type_label}</TableCell>
      <TableCell>{entry.process?.code ?? '—'}</TableCell>
      <TableCell>{entry.version_label ?? '—'}</TableCell>
      <TableCell>{formatDate(entry.effective_date)}</TableCell>
      <TableCell>
        <Badge tone={DOCUMENT_STATUS_TONES[entry.status]}>
          {DOCUMENT_STATUS_LABELS[entry.status]}
        </Badge>
      </TableCell>
      <TableCell>{entry.owner_position ?? '—'}</TableCell>
    </TableRow>
  );
}

function Entries({ entries }: { readonly entries: readonly MasterListEntry[] }): JSX.Element {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<ListChecks />}
        title="No hay documentos con estos filtros"
        description="Cambie los filtros o cargue el Listado Maestro con el comando de carga inicial."
      />
    );
  }
  return (
    <SimpleTable
      headers={['Código', 'Nombre', 'Tipo', 'Proceso', 'Versión', 'Fecha', 'Estado', 'Responsable']}
    >
      {entries.map((entry) => (
        <EntryRow key={entry.document_id} entry={entry} />
      ))}
    </SimpleTable>
  );
}

export function MasterList(): JSX.Element {
  const [filters, setFilters] = useState<Filters>({ status: 'current' });
  const list = useMasterList({ ...filters, q: (filters.q ?? '').length >= 2 ? filters.q : '' });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Listado Maestro"
        description="Los documentos del SGC (RE-SGC-001), siempre al día: se arma con los documentos mismos."
        action={<ExportButton filters={filters} />}
      />
      <FilterFields filters={filters} onChange={setFilters} />
      <QueryState query={list} loadingLabel="Cargando el Listado Maestro">
        {(data) => (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{String(data.total)} documentos.</p>
            <Entries entries={data.data} />
          </div>
        )}
      </QueryState>
    </div>
  );
}
