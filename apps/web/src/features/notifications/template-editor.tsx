'use client';

import type { NotificationTemplate, UpdateNotificationTemplateRequest } from '@arza/contracts';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { formatDateTime } from '../../lib/format/date-time';
import { FormError, FormSuccess } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { CheckboxField, TextInput } from '../organization/record-dialog';
import { CommentField } from '../workflows/workflow-actions';
import { useSaveTemplate, useTemplates } from './queries';

const URGENT_HINT =
  'Excepción al envío diferido (PT-GTH-001): el aviso llega al instante y siempre por correo, también fuera de la jornada. Úsela solo para lo que no puede esperar.';

function variablesHint(template: NotificationTemplate): string {
  const names = template.variables.map((name) => `{{${name}}}`).join(', ');
  return `Puede usar: ${names}. El saludo, el botón y la firma de ARZA TECH los pone la plataforma.`;
}

type Draft = UpdateNotificationTemplateRequest;

function TemplateFields(props: {
  readonly template: NotificationTemplate;
  readonly draft: Draft;
  readonly onChange: (draft: Draft) => void;
}): JSX.Element {
  const { template, draft, onChange } = props;
  const id = `plantilla-${template.kind}`;
  return (
    <>
      <TextInput
        id={`${id}-asunto`}
        label="Asunto"
        value={draft.subject}
        maxLength={150}
        required
        onValue={(subject) => {
          onChange({ ...draft, subject });
        }}
      />
      <CommentField
        id={`${id}-texto`}
        label="Texto"
        hint={variablesHint(template)}
        value={draft.body}
        onChange={(body) => {
          onChange({ ...draft, body });
        }}
      />
      <CheckboxField
        id={`${id}-urgente`}
        label="Urgente"
        hint={URGENT_HINT}
        checked={draft.urgent}
        onChange={(urgent) => {
          onChange({ ...draft, urgent });
        }}
      />
    </>
  );
}

function TemplateForm(props: {
  readonly template: NotificationTemplate;
  readonly justSaved: boolean;
  readonly onSaved: () => void;
}): JSX.Element {
  const { template } = props;
  const [draft, setDraft] = useState<Draft>({
    subject: template.subject,
    body: template.body,
    urgent: template.urgent,
  });
  const save = useSaveTemplate(props.onSaved);
  const changed =
    draft.subject !== template.subject ||
    draft.body !== template.body ||
    draft.urgent !== template.urgent;
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    save.execute({ kind: template.kind, version: template.version, body: draft });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-label={template.label}>
      <TemplateFields template={template} draft={draft} onChange={setDraft} />
      {save.error === null ? null : <FormError error={save.error} />}
      {props.justSaved && !changed ? (
        <FormSuccess message="Plantilla guardada como versión nueva." />
      ) : null}
      <SubmitButton
        label="Guardar versión nueva"
        pendingLabel="Guardando…"
        pending={save.pending}
        done={!changed}
        className="self-start"
      />
      {save.dialog}
    </form>
  );
}

function TemplateCard({ template }: { readonly template: NotificationTemplate }): JSX.Element {
  const [savedFrom, setSavedFrom] = useState<number | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {template.label}
          {template.urgent ? <Badge tone="warning">Urgente</Badge> : null}
        </CardTitle>
        <CardDescription>
          Versión {template.version} · {formatDateTime(template.updated_at)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* La clave con la versión reinicia el formulario cuando llega la versión guardada. */}
        <TemplateForm
          key={`${template.kind}-${String(template.version)}`}
          template={template}
          justSaved={savedFrom !== null && savedFrom < template.version}
          onSaved={() => {
            setSavedFrom(template.version);
          }}
        />
      </CardContent>
    </Card>
  );
}

/** Administración › Plantillas (B16): el texto institucional de cada tipo de aviso. */
export function TemplateEditor(): JSX.Element {
  const templates = useTemplates();
  return (
    <QueryState query={templates} loadingLabel="Cargando las plantillas">
      {(data) => (
        <div className="grid gap-6 xl:grid-cols-2">
          {data.items.map((template) => (
            <TemplateCard key={template.kind} template={template} />
          ))}
        </div>
      )}
    </QueryState>
  );
}
