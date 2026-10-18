'use client';

import { FORM_FLOWS, FORM_TEMPLATE_STATUSES, type FormTemplateSummary } from '@arza/contracts';
import { Badge, buttonVariants, EmptyState, TableCell, TableRow } from '@arza/ui';
import { FileSpreadsheet } from 'lucide-react';
import Link from 'next/link';
import { useState, type JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { QueryState } from '../administration/query-state';
import { SimpleTable } from '../administration/simple-table';
import { CheckboxField } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import {
  NEW_FORM_PATH,
  OUTPUT_TEMPLATES_PATH,
  RECORDS_PATH,
  TEMPLATE_STATUS_TONES,
  fillPath,
  formPath,
} from './labels';
import { useFormTemplates } from './queries';

// Formatos digitales (B20, capítulo 18, forma B): cada versión con su estado, quién aprueba sus
// registros y, si está publicado, el enlace para diligenciarlo.

function canFill(template: FormTemplateSummary): boolean {
  return (
    template.status === 'published' &&
    template.fill_mode === 'manual' &&
    template.entity_type !== 'doc_version'
  );
}

function TemplateRow(props: {
  readonly template: FormTemplateSummary;
  readonly fills: boolean;
}): JSX.Element {
  const { template } = props;
  return (
    <TableRow>
      <TableCell className="font-medium">
        <Link href={formPath(template.id)} className="text-primary hover:underline">
          {template.code}
        </Link>
      </TableCell>
      <TableCell>
        <p>{template.name}</p>
        <p className="text-xs text-muted-foreground">
          Versión {template.form_version} · {template.field_count} campos
        </p>
      </TableCell>
      <TableCell>
        <Badge tone={TEMPLATE_STATUS_TONES[template.status]}>
          {FORM_TEMPLATE_STATUSES[template.status]}
        </Badge>
      </TableCell>
      <TableCell>
        {template.fill_mode === 'system'
          ? 'Lo llena la plataforma'
          : template.workflow_key === null
            ? 'Sin aprobación'
            : FORM_FLOWS[template.workflow_key]}
      </TableCell>
      <TableCell>
        {props.fills && canFill(template) ? (
          <Link href={fillPath(template.id)} className={buttonVariants({ size: 'sm' })}>
            Diligenciar
          </Link>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function Templates(props: {
  readonly templates: readonly FormTemplateSummary[];
  readonly showRetired: boolean;
}): JSX.Element {
  const fills = usePermissions().can('doc.form_record.create');
  const shown = props.templates.filter((t) => props.showRetired || t.status !== 'retired');
  if (shown.length === 0) {
    return (
      <EmptyState
        icon={<FileSpreadsheet />}
        title="No hay formatos digitales"
        description="Calidad diseña los formatos a partir de los FT del Listado Maestro."
      />
    );
  }
  return (
    <SimpleTable headers={['Código', 'Formato', 'Estado', 'Aprobación', 'Acciones']}>
      {shown.map((template) => (
        <TemplateRow key={template.id} template={template} fills={fills} />
      ))}
    </SimpleTable>
  );
}

function HeaderLinks(): JSX.Element {
  const manages = usePermissions().can('doc.form_template.manage');
  return (
    <div className="flex flex-wrap gap-2">
      <Link href={RECORDS_PATH} className={buttonVariants({ variant: 'outline' })}>
        Registros diligenciados
      </Link>
      {manages ? (
        <>
          <Link href={OUTPUT_TEMPLATES_PATH} className={buttonVariants({ variant: 'outline' })}>
            Plantillas de salida
          </Link>
          <Link href={NEW_FORM_PATH} className={buttonVariants()}>
            Nuevo formato
          </Link>
        </>
      ) : null}
    </div>
  );
}

export function TemplateList(): JSX.Element {
  const [showRetired, setShowRetired] = useState(false);
  const templates = useFormTemplates();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Formatos digitales"
        description="Los formatos del SGC para diligenciar en pantalla, con su aprobación y su PDF con el encabezado institucional."
        action={<HeaderLinks />}
      />
      <CheckboxField
        id="formatos-retirados"
        label="Ver también las versiones retiradas"
        checked={showRetired}
        onChange={setShowRetired}
      />
      <QueryState query={templates} loadingLabel="Cargando los formatos">
        {(data) => <Templates templates={data.data} showRetired={showRetired} />}
      </QueryState>
    </div>
  );
}
