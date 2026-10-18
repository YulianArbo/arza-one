'use client';

import {
  FORM_ENTITY_TYPES,
  FORM_FIELD_TYPES,
  FORM_FLOWS,
  FORM_TEMPLATE_STATUSES,
  type FormTemplate,
} from '@arza/contracts';
import { Badge, buttonVariants } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { PageHeader } from '../../components/app-shell/page-header';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import {
  FORMS_PATH,
  TEMPLATE_STATUS_TONES,
  editFormPath,
  fillPath,
  newFormVersionPath,
} from './labels';
import { PreviewButton } from './preview-frame';
import { useFormTemplate, useTemplateAction } from './queries';

// Ficha de una versión de un formato digital (B20): sus datos, sus secciones y campos, la vista
// previa con el encabezado institucional y lo que la persona puede hacer ahora.

function Facts({ template }: { readonly template: FormTemplate }): JSX.Element {
  const facts: readonly (readonly [string, string])[] = [
    ['Versión', String(template.form_version)],
    [
      'Aprobación de los registros',
      template.workflow_key === null
        ? 'Sin aprobación: termina al enviarlo'
        : FORM_FLOWS[template.workflow_key],
    ],
    [
      'Se une a',
      template.entity_type === null ? 'Ningún registro' : FORM_ENTITY_TYPES[template.entity_type],
    ],
    ['Clasificación', template.classification === 'confidential' ? 'Confidencial' : 'Interno'],
    [
      'Plantilla de salida',
      template.output_template === null
        ? 'Maqueta institucional del formato'
        : `${template.output_template.code} · versión ${String(template.output_template.output_version)}`,
    ],
    [
      'Publicado',
      template.published_at === null
        ? '—'
        : `${formatDateTime(template.published_at)}${template.published_by === null ? '' : ` por ${template.published_by.name}`}`,
    ],
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

function Fields({ template }: { readonly template: FormTemplate }): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      {template.definition.sections.map((section) => (
        <section key={section.key}>
          <h2 className="text-base font-semibold">{section.title}</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {section.fields.map((field) => (
              <li key={field.key}>
                {field.label} ·{' '}
                <span className="text-muted-foreground">
                  {FORM_FIELD_TYPES[field.type]}
                  {field.required ? ', obligatorio' : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ConfirmAction(props: {
  readonly template: FormTemplate;
  readonly action: 'publish' | 'retire';
}): JSX.Element {
  const action = useTemplateAction(props.action);
  const publishes = props.action === 'publish';
  const label = publishes ? 'Publicar' : 'Retirar';
  return (
    <div className="flex flex-col gap-1">
      <ConfirmActionButton
        label={label}
        title={`${label}: ${props.template.code} versión ${String(props.template.form_version)}`}
        description={
          publishes
            ? 'Queda en uso y ya no se puede cambiar. La versión publicada anterior pasa a retirada; sus registros la conservan.'
            : 'Deja de diligenciarse. Los registros que ya existen se conservan con su versión.'
        }
        confirmLabel={`Sí, ${label.toLowerCase()}`}
        disabled={action.pending}
        onConfirm={() => {
          action.execute({ id: props.template.id, version: props.template.version });
        }}
      />
      {action.error === null ? null : <FormError error={action.error} />}
      {action.dialog}
    </div>
  );
}

function Actions({ template }: { readonly template: FormTemplate }): JSX.Element {
  const has = (action: FormTemplate['actions'][number]) => template.actions.includes(action);
  return (
    <div className="flex flex-wrap items-start gap-2">
      <PreviewButton
        kind="form-templates"
        id={template.id}
        title={`${template.code} · ${template.name}`}
      />
      {has('fill') && template.entity_type !== 'doc_version' ? (
        <Link href={fillPath(template.id)} className={buttonVariants()}>
          Diligenciar
        </Link>
      ) : null}
      {has('edit') ? (
        <Link href={editFormPath(template.id)} className={buttonVariants({ variant: 'outline' })}>
          Editar el borrador
        </Link>
      ) : null}
      {has('publish') ? <ConfirmAction template={template} action="publish" /> : null}
      {has('new_version') ? (
        <Link
          href={newFormVersionPath(template.id)}
          className={buttonVariants({ variant: 'outline' })}
        >
          Nueva versión
        </Link>
      ) : null}
      {has('retire') ? <ConfirmAction template={template} action="retire" /> : null}
    </div>
  );
}

function TemplateView({ template }: { readonly template: FormTemplate }): JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${template.code} · ${template.name}`}
        description={
          template.document === null
            ? 'Formato digital del SGC.'
            : `Documento del Listado Maestro: ${template.document.code} · ${template.document.name}`
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={TEMPLATE_STATUS_TONES[template.status]}>
          {FORM_TEMPLATE_STATUSES[template.status]}
        </Badge>
        <Link href={FORMS_PATH} className="text-sm text-primary hover:underline">
          Volver a los formatos
        </Link>
      </div>
      <Facts template={template} />
      <Actions template={template} />
      <Fields template={template} />
    </div>
  );
}

export function TemplateDetail({ id }: { readonly id: string }): JSX.Element {
  const template = useFormTemplate(id);
  return (
    <QueryState query={template} loadingLabel="Cargando el formato">
      {(data) => <TemplateView template={data} />}
    </QueryState>
  );
}
