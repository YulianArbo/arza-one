'use client';

import { downloadLinkResponseSchema, type Deliverable, type ProjectDetail } from '@arza/contracts';
import { Badge, Button, EmptyState, SimpleTable, TableCell, TableRow } from '@arza/ui';
import { PackageCheck } from 'lucide-react';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { save } from '../audit/audit-export-button';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { RecordDialog } from '../organization/record-dialog';
import { DeliverForm } from './deliver-form';
import {
  ChoiceFields,
  DialogForm,
  Fields,
  summaryOf,
  useDialogForm,
  type ChoiceSpec,
  type FieldSpec,
} from './form-bits';
import {
  ACCEPTANCE_STATUSES,
  ACCEPTANCE_TONES,
  DELIVERABLE_STATUSES,
  DELIVERABLE_TONES,
} from './labels';
import { useDeliverables, useProjectAction } from './queries';

// Entregables del proyecto (B27, ficha 17.8): en preparación → entregado → aceptado o devuelto. El
// equipo los prepara; el líder o un Líder técnico los entrega y la persona del cliente firma el acta
// FT-TEC-001 con enlace y código. Se descarga el acta: la firmada si ya la hay.

interface Props {
  readonly project: ProjectDetail;
}

interface Values {
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly milestoneId: string;
  readonly url: string;
}

const FIELDS: readonly FieldSpec<'name' | 'description' | 'version' | 'url'>[] = [
  { key: 'name', field: 'name', id: 'entregable-nombre', label: 'Nombre' },
  { key: 'version', field: 'version_label', id: 'entregable-version', label: 'Versión' },
  {
    key: 'url',
    field: 'evidence_url',
    id: 'entregable-enlace',
    label: 'Dónde está',
    type: 'url',
    hint: 'Repositorio, entorno o documento; opcional.',
  },
  {
    key: 'description',
    field: 'description',
    id: 'entregable-descripcion',
    label: 'Qué se entrega',
    multiline: true,
  },
];

function problemsOf(values: Values): Record<string, string> {
  const found: Record<string, string> = {};
  if (values.name.trim().length < 3) found['name'] = 'Escriba el nombre del entregable.';
  if (values.url.trim() !== '' && !/^https:\/\/\S+$/u.test(values.url.trim())) {
    found['evidence_url'] = 'Pegue el enlace completo, que empiece por https://';
  }
  return found;
}

function bodyOf(values: Values): object {
  const optional = (text: string, min: number) => (text.trim().length >= min ? text.trim() : null);
  return {
    name: values.name.trim(),
    description: optional(values.description, 3),
    version_label: optional(values.version, 1),
    milestone_id: values.milestoneId === '' ? null : values.milestoneId,
    evidence_url: optional(values.url, 1),
  };
}

function initialOf(deliverable: Deliverable | undefined): Values {
  return {
    name: deliverable?.name ?? '',
    description: deliverable?.description ?? '',
    version: deliverable?.version_label ?? '',
    milestoneId: deliverable?.milestone?.id ?? '',
    url: deliverable?.evidence_url ?? '',
  };
}

function milestoneChoice(project: ProjectDetail, current: string): ChoiceSpec<'milestoneId'> {
  const open = project.milestones.filter((m) => m.status === 'pending' || m.id === current);
  return {
    key: 'milestoneId',
    field: 'milestone_id',
    id: 'entregable-hito',
    label: 'Hito',
    hint: 'Cuando el cliente acepta todos los entregables del hito, queda listo para facturar.',
    options: [
      { value: '', label: 'Sin hito' },
      ...open.map((milestone) => ({ value: milestone.id, label: milestone.name })),
    ],
  };
}

type FormProps = Props & { readonly deliverable?: Deliverable; readonly onDone: () => void };

function useDeliverableForm(props: FormProps) {
  const api = useApiClient();
  const { deliverable } = props;
  const base = `/v1/projects/${props.project.id}/deliverables`;
  const save = useProjectAction<object>(async (body, csrfToken) => {
    if (deliverable === undefined) await api.post(base, { body, csrfToken });
    else
      await api.put(`${base}/${deliverable.id}`, { body, version: deliverable.version, csrfToken });
  }, props.onDone);
  const form = useDialogForm(initialOf(deliverable), problemsOf, (values) => {
    save.execute(bodyOf(values));
  });
  return { save, form };
}

function DeliverableForm(props: FormProps): JSX.Element {
  const { save, form } = useDeliverableForm(props);
  const choices = [milestoneChoice(props.project, form.values.milestoneId)];
  const change = (key: keyof Values, value: string): void => {
    form.set({ [key]: value });
  };
  return (
    <DialogForm
      problems={form.problems}
      fields={summaryOf(FIELDS)}
      action={save}
      submitLabel="Guardar"
      onSubmit={form.submit}
    >
      <Fields specs={FIELDS} values={form.values} problems={form.problems} onChange={change} />
      <ChoiceFields
        specs={choices}
        values={form.values}
        problems={form.problems}
        onChange={change}
      />
    </DialogForm>
  );
}

function ActaButton(props: Props & { readonly deliverable: Deliverable }): JSX.Element {
  const api = useApiClient();
  const path = `/v1/projects/${props.project.id}/deliverables/${props.deliverable.id}/acta-link`;
  const signed = props.deliverable.acceptance?.signed_pdf === true;
  const open = useProjectAction<undefined>(async (_args, csrfToken) => {
    const link = await api.post(path, { body: {}, csrfToken, schema: downloadLinkResponseSchema });
    const code = props.deliverable.acceptance?.record_code ?? 'acta';
    save({
      fileName: `${code}${signed ? '-firmada' : ''}.pdf`,
      content: await api.fetchFile(link.url),
    });
  });
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={open.pending}
        onClick={() => {
          open.execute(undefined);
        }}
      >
        {signed ? 'Descargar el acta firmada' : 'Descargar el acta'}
      </Button>
      {open.error === null ? null : <FormError error={open.error} />}
      {open.dialog}
    </>
  );
}

function canEdit(deliverable: Deliverable): boolean {
  return deliverable.status === 'preparing' || deliverable.status === 'returned';
}

function canDeliver(deliverable: Deliverable): boolean {
  const open = ['preparing', 'in_signature'];
  return deliverable.status !== 'accepted' && !open.includes(deliverable.acceptance?.status ?? '');
}

function RowActions(props: Props & { readonly deliverable: Deliverable }): JSX.Element {
  const { project, deliverable } = props;
  const working = project.status !== 'closed';
  return (
    <div className="flex flex-wrap gap-2">
      {working && project.can.manage_items && canEdit(deliverable) ? (
        <RecordDialog
          triggerLabel="Corregir"
          variant="outline"
          title="Corregir el entregable"
          description="Se corrige mientras está en preparación o después de que el cliente lo devolvió."
        >
          {(close) => (
            <DeliverableForm project={project} deliverable={deliverable} onDone={close} />
          )}
        </RecordDialog>
      ) : null}
      {working && project.can.deliver && canDeliver(deliverable) ? (
        <RecordDialog
          triggerLabel="Entregar al cliente"
          variant="outline"
          title={`Entregar «${deliverable.name}»`}
          description="Se genera el Acta de Entrega Técnica FT-TEC-001 y se envía a firmar a la persona del cliente."
        >
          {(close) => <DeliverForm project={project} deliverable={deliverable} onDone={close} />}
        </RecordDialog>
      ) : null}
      {deliverable.acceptance === null ? null : (
        <ActaButton project={project} deliverable={deliverable} />
      )}
    </div>
  );
}

function AcceptanceCell({ deliverable }: { readonly deliverable: Deliverable }): JSX.Element {
  const acceptance = deliverable.acceptance;
  if (acceptance === null) return <span className="text-muted-foreground">Sin entregar</span>;
  return (
    <div className="flex flex-col gap-1">
      <Badge tone={ACCEPTANCE_TONES[acceptance.status]}>
        {ACCEPTANCE_STATUSES[acceptance.status]}
      </Badge>
      <span className="text-xs text-muted-foreground">
        {acceptance.record_code ?? 'Acta en preparación'} · {acceptance.signer_name} · responde
        hasta el {formatDate(acceptance.respond_by)}
      </span>
      {acceptance.client_note === null ? null : (
        <span className="text-xs">Motivo del cliente: {acceptance.client_note}</span>
      )}
    </div>
  );
}

function DeliverablesTable(props: Props & { readonly rows: readonly Deliverable[] }): JSX.Element {
  if (props.rows.length === 0) {
    return (
      <EmptyState
        icon={<PackageCheck />}
        title="Sin entregables"
        description="Registre lo que se entregará al cliente y, si aplica, el hito al que pertenece."
      />
    );
  }
  return (
    <SimpleTable
      caption="Entregables del proyecto y su acta de entrega"
      scrollLabel="Entregables; desplácese a los lados para ver todas las columnas"
      headers={['Entregable', 'Hito', 'Estado', 'Acta', 'Acción']}
    >
      {props.rows.map((deliverable) => (
        <TableRow key={deliverable.id}>
          <TableCell>
            {deliverable.name}
            {deliverable.version_label === null ? '' : ` · ${deliverable.version_label}`}
          </TableCell>
          <TableCell>{deliverable.milestone?.name ?? '—'}</TableCell>
          <TableCell>
            <Badge tone={DELIVERABLE_TONES[deliverable.status]}>
              {DELIVERABLE_STATUSES[deliverable.status]}
            </Badge>
          </TableCell>
          <TableCell>
            <AcceptanceCell deliverable={deliverable} />
          </TableCell>
          <TableCell>
            <RowActions project={props.project} deliverable={deliverable} />
          </TableCell>
        </TableRow>
      ))}
    </SimpleTable>
  );
}

export function DeliverablesPanel({ project }: Props): JSX.Element {
  const deliverables = useDeliverables(project.id);
  return (
    <div className="flex flex-col gap-4">
      {project.can.manage_items && project.status !== 'closed' ? (
        <div>
          <RecordDialog
            triggerLabel="Agregar un entregable"
            title="Nuevo entregable"
            description="Queda en preparación hasta que el líder lo entregue al cliente."
          >
            {(close) => <DeliverableForm project={project} onDone={close} />}
          </RecordDialog>
        </div>
      ) : null}
      <QueryState query={deliverables} loadingLabel="Cargando los entregables">
        {(data) => <DeliverablesTable project={project} rows={data.data} />}
      </QueryState>
    </div>
  );
}
