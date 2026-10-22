'use client';

import {
  OUTPUT_ENGINES,
  OUTPUT_TEMPLATE_STATUSES,
  type OutputTemplate,
  type OutputTemplateSummary,
} from '@arza/contracts';
import { Badge, EmptyState, SimpleTable, TableCell, TableRow } from '@arza/ui';
import { FileCode } from 'lucide-react';
import type { JSX } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { PageHeader } from '../../components/app-shell/page-header';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { RecordDialog } from '../organization/record-dialog';
import { OUTPUT_STATUS_TONES } from './labels';
import {
  contentOf,
  CreateOutputForm,
  EditOutputForm,
  EMPTY_CONTENT,
} from './output-template-forms';
import { PreviewButton } from './preview-frame';
import { useOutputTemplate, useOutputTemplates, usePublishOutputTemplate } from './queries';

// Plantillas de salida (B20, numeral 13.2): HTML con variables {{nombre}} o Word con variables
// {nombre}, que se llenan con los datos del registro. Al publicarse no cambian; la anterior del
// mismo código pasa a retirada y los formatos conservan la versión que eligieron.

function titleOf(template: OutputTemplate): string {
  return `${template.code} versión ${String(template.output_version)}`;
}

function PublishButton({ template }: { readonly template: OutputTemplate }): JSX.Element {
  const publish = usePublishOutputTemplate();
  return (
    <div className="flex flex-col gap-1">
      <ConfirmActionButton
        label="Publicar"
        title={`Publicar ${titleOf(template)}`}
        description="Queda en uso y ya no cambia. La versión publicada anterior pasa a retirada."
        confirmLabel="Sí, publicar"
        disabled={publish.pending}
        onConfirm={() => {
          publish.execute({ id: template.id, version: template.version });
        }}
      />
      {publish.error === null ? null : <FormError error={publish.error} />}
      {publish.dialog}
    </div>
  );
}

function EditDialog({ template }: { readonly template: OutputTemplate }): JSX.Element {
  return (
    <RecordDialog
      triggerLabel="Editar"
      triggerAriaLabel={`Editar ${titleOf(template)}`}
      variant="outline"
      title={`Editar ${titleOf(template)}`}
      description="Solo el borrador se puede cambiar."
    >
      {(close) => <EditOutputForm template={template} onDone={close} />}
    </RecordDialog>
  );
}

function NewVersionDialog({ template }: { readonly template: OutputTemplate }): JSX.Element {
  return (
    <RecordDialog
      triggerLabel="Nueva versión"
      triggerAriaLabel={`Nueva versión de ${template.code}`}
      variant="outline"
      title={`Nueva versión de ${template.code}`}
      description="Empieza como borrador con el contenido de la versión publicada."
    >
      {(close) => <CreateOutputForm initial={contentOf(template, false)} onDone={close} />}
    </RecordDialog>
  );
}

function TemplateActions({
  summary,
}: {
  readonly summary: OutputTemplateSummary;
}): JSX.Element | null {
  const template = useOutputTemplate(summary.id).data;
  if (template === undefined) return null;
  return (
    <div className="flex flex-wrap items-start gap-2">
      <PreviewButton kind="output-templates" id={template.id} title={titleOf(template)} />
      {template.actions.includes('edit') ? <EditDialog template={template} /> : null}
      {template.actions.includes('publish') ? <PublishButton template={template} /> : null}
      {template.actions.includes('new_version') ? <NewVersionDialog template={template} /> : null}
    </div>
  );
}

function TemplateRow({ template }: { readonly template: OutputTemplateSummary }): JSX.Element {
  return (
    <TableRow>
      <TableCell className="font-medium">{template.code}</TableCell>
      <TableCell>
        <p>{template.name}</p>
        <p className="text-xs text-muted-foreground">
          {OUTPUT_ENGINES[template.engine]} · versión {template.output_version}
        </p>
      </TableCell>
      <TableCell>
        <Badge tone={OUTPUT_STATUS_TONES[template.status]}>
          {OUTPUT_TEMPLATE_STATUSES[template.status]}
        </Badge>
      </TableCell>
      <TableCell>
        <TemplateActions summary={template} />
      </TableCell>
    </TableRow>
  );
}

function Templates({
  templates,
}: {
  readonly templates: readonly OutputTemplateSummary[];
}): JSX.Element {
  if (templates.length === 0) {
    return (
      <EmptyState
        icon={<FileCode />}
        title="No hay plantillas de salida"
        description="Sin plantilla, el PDF de cada formato usa su maqueta institucional."
      />
    );
  }
  return (
    <SimpleTable headers={['Código', 'Plantilla', 'Estado', 'Acciones']}>
      {templates.map((template) => (
        <TemplateRow key={template.id} template={template} />
      ))}
    </SimpleTable>
  );
}

export function OutputTemplatesPanel(): JSX.Element {
  const templates = useOutputTemplates();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Plantillas de salida"
        description="Plantillas HTML o Word para el PDF de los formatos. El encabezado y el pie institucionales se agregan solos a las HTML; las de Word usan los del propio Word."
        action={
          <RecordDialog
            triggerLabel="Nueva plantilla"
            title="Nueva plantilla de salida"
            description="Empieza como borrador; publíquela para usarla en un formato."
          >
            {(close) => <CreateOutputForm initial={EMPTY_CONTENT} onDone={close} />}
          </RecordDialog>
        }
      />
      <QueryState query={templates} loadingLabel="Cargando las plantillas">
        {(data) => <Templates templates={data.data} />}
      </QueryState>
    </div>
  );
}
