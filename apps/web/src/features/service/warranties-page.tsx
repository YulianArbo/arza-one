'use client';

import type { Warranty, WarrantyListResponse } from '@arza/contracts';
import { Badge, EmptyState, SelectField, SimpleTable, TableCell, TableRow } from '@arza/ui';
import { ShieldCheck } from 'lucide-react';
import { useState, type JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { RecordDialog } from '../organization/record-dialog';
import { DialogForm, Fields, useDialogForm, type FieldSpec } from '../projects/form-bits';
import { useServiceAction, useWarranties } from './queries';
import { BackLink } from './service-bits';

// Garantías por entregable (B28, decisión 10). Nacen cuando el cliente acepta un entregable en
// Proyectos: 90 días desde la aceptación. Servicio al cliente ajusta su fin y su alcance.

const TEXTS: readonly FieldSpec<'endsOn' | 'scope'>[] = [
  {
    key: 'endsOn',
    field: 'ends_on',
    id: 'garantia-fin',
    label: 'Hasta cuándo cubre',
    type: 'date',
  },
  { key: 'scope', field: 'scope', id: 'garantia-alcance', label: 'Qué cubre', multiline: true },
];

interface Values {
  readonly endsOn: string;
  readonly scope: string;
}

function problemsFor(warranty: Warranty) {
  return (values: Values): Record<string, string> => {
    const found: Record<string, string> = {};
    if (values.endsOn < warranty.starts_on)
      found['ends_on'] = 'No puede terminar antes de empezar.';
    if (values.scope.trim().length < 3) found['scope'] = 'Escriba qué cubre la garantía.';
    return found;
  };
}

function useWarrantyForm(warranty: Warranty, onDone: () => void) {
  const api = useApiClient();
  const save = useServiceAction<object>(async (body, csrfToken) => {
    await api.put(`/v1/warranties/${warranty.id}`, { body, version: warranty.version, csrfToken });
  }, onDone);
  const initial: Values = { endsOn: warranty.ends_on, scope: warranty.scope };
  const form = useDialogForm(initial, problemsFor(warranty), (values) => {
    save.execute({ ends_on: values.endsOn, scope: values.scope.trim() });
  });
  return { save, form };
}

function WarrantyForm(props: { readonly warranty: Warranty; readonly onDone: () => void }) {
  const { save, form } = useWarrantyForm(props.warranty, props.onDone);
  return (
    <DialogForm
      problems={form.problems}
      fields={TEXTS}
      action={save}
      submitLabel="Guardar"
      onSubmit={form.submit}
    >
      <Fields
        specs={TEXTS}
        values={form.values}
        problems={form.problems}
        onChange={(key, value) => {
          form.set({ [key]: value });
        }}
      />
    </DialogForm>
  );
}

function WarrantyRow(props: { readonly warranty: Warranty; readonly canManage: boolean }) {
  const { warranty } = props;
  return (
    <TableRow>
      <TableCell>
        {warranty.deliverable.name}
        <p className="text-xs text-muted-foreground">
          {warranty.project.code} · {warranty.project.name}
        </p>
      </TableCell>
      <TableCell>{warranty.party?.name ?? '—'}</TableCell>
      <TableCell>
        {formatDate(warranty.starts_on)} – {formatDate(warranty.ends_on)}
      </TableCell>
      <TableCell>
        <Badge tone={warranty.active ? 'success' : 'neutral'}>
          {warranty.active ? 'Vigente' : 'Vencida'}
        </Badge>
      </TableCell>
      <TableCell>
        {props.canManage ? (
          <RecordDialog
            triggerLabel="Ajustar"
            variant="outline"
            triggerAriaLabel={`Ajustar la garantía de ${warranty.deliverable.name}`}
            title="Ajustar la garantía"
            description={warranty.deliverable.name}
          >
            {(close) => <WarrantyForm warranty={warranty} onDone={close} />}
          </RecordDialog>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function WarrantyTable({ data }: { readonly data: WarrantyListResponse }): JSX.Element {
  if (data.data.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck />}
        title="No hay garantías en esta vista"
        description="Cuando el cliente acepta un entregable en Proyectos, su garantía aparece aquí."
      />
    );
  }
  return (
    <SimpleTable
      caption="Garantías por entregable"
      scrollLabel="Garantías; desplácese a los lados para ver todas las columnas"
      headers={['Entregable', 'Cliente', 'Vigencia', 'Estado', 'Acción']}
    >
      {data.data.map((warranty) => (
        <WarrantyRow key={warranty.id} warranty={warranty} canManage={data.can_manage} />
      ))}
    </SimpleTable>
  );
}

const ACTIVE_OPTIONS = [
  { value: 'true', label: 'Vigentes' },
  { value: 'false', label: 'Vencidas' },
  { value: '', label: 'Todas' },
];

export function WarrantiesPage(): JSX.Element {
  const [active, setActive] = useState('true');
  const warranties = useWarranties(active);
  return (
    <div className="flex flex-col gap-4">
      <BackLink />
      <PageHeader
        title="Garantías"
        description="Nacen cuando el cliente acepta un entregable: 90 días desde la aceptación. Las que vencen primero, arriba."
      />
      <div className="max-w-xs">
        <SelectField
          id="garantias-vigencia"
          label="Mostrar"
          options={ACTIVE_OPTIONS}
          value={active}
          onChange={(event) => {
            setActive(event.target.value);
          }}
        />
      </div>
      <QueryState query={warranties} loadingLabel="Cargando las garantías">
        {(data) => <WarrantyTable data={data} />}
      </QueryState>
    </div>
  );
}
