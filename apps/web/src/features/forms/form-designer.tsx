'use client';

import {
  formClassificationSchema,
  formEntityTypeSchema,
  formFlowKeySchema,
  type FormTemplate,
  type UpdateFormTemplate,
} from '@arza/contracts';
import { Button } from '@arza/ui';
import { useRouter } from 'next/navigation';
import { useState, type JSX, type SubmitEvent } from 'react';

import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { SettingsFields, type DesignSettings } from './design-settings';
import {
  definitionOf,
  designProblems,
  newSection,
  sectionsOf,
  type DesignSection,
} from './design-model';
import { formPath } from './labels';
import { useCreateFormTemplate, useFormTemplate, useUpdateFormTemplate } from './queries';
import { SectionEditor } from './section-editor';

// Diseñador de formatos (B20, capítulo 18, forma B): Calidad arma las secciones y los campos sin
// programar. Se guarda en borrador; al publicarlo nace la versión y ya no cambia.

export type DesignMode =
  | { readonly kind: 'new' }
  | { readonly kind: 'edit'; readonly template: FormTemplate }
  | { readonly kind: 'version'; readonly template: FormTemplate };

function settingsOf(mode: DesignMode): DesignSettings {
  if (mode.kind === 'new') {
    return {
      code: '',
      name: '',
      workflowKey: '',
      classification: 'internal',
      entityType: '',
      outputTemplateId: '',
    };
  }
  const { template } = mode;
  return {
    code: template.code,
    name: template.name,
    workflowKey: template.workflow_key ?? '',
    classification: template.classification,
    entityType: template.entity_type ?? '',
    outputTemplateId: template.output_template?.id ?? '',
  };
}

function bodyOf(
  settings: DesignSettings,
  sections: readonly DesignSection[],
  mode: DesignMode,
): UpdateFormTemplate {
  const entity = formEntityTypeSchema.safeParse(settings.entityType);
  const flow = formFlowKeySchema.safeParse(settings.workflowKey);
  const template = mode.kind === 'new' ? null : mode.template;
  return {
    name: settings.name.trim(),
    definition: definitionOf(sections),
    layout: template?.layout ?? { orientation: 'portrait' },
    document_id: template?.document?.id ?? null,
    output_template_id: settings.outputTemplateId === '' ? null : settings.outputTemplateId,
    workflow_key: flow.success ? flow.data : null,
    classification: formClassificationSchema.parse(settings.classification),
    entity_type: entity.success ? entity.data : null,
  };
}

/** Guarda el borrador: lo crea (formato nuevo o versión nueva) o lo corrige. */
function useDesignSave(mode: DesignMode) {
  const router = useRouter();
  const go = (id: string): void => {
    router.push(formPath(id));
  };
  const target = mode.kind === 'edit' ? mode.template : { id: '', version: 1 };
  const create = useCreateFormTemplate(go);
  const update = useUpdateFormTemplate({ id: target.id, version: target.version }, () => {
    go(target.id);
  });
  const action = mode.kind === 'edit' ? update : create;
  const save = (body: UpdateFormTemplate, code: string): void => {
    if (mode.kind === 'edit') update.execute(body);
    else create.execute({ ...body, code });
  };
  return { action, save };
}

function Problems({ problems }: { readonly problems: readonly string[] }): JSX.Element | null {
  if (problems.length === 0) return null;
  return (
    <ul
      role="alert"
      className="list-disc rounded-md border border-destructive p-3 pl-8 text-sm text-destructive"
    >
      {problems.map((problem) => (
        <li key={problem}>{problem}</li>
      ))}
    </ul>
  );
}

function Sections(props: {
  readonly sections: DesignSection[];
  readonly onChange: (sections: DesignSection[]) => void;
}): JSX.Element {
  const { sections, onChange } = props;
  return (
    <>
      {sections.map((section, index) => (
        <SectionEditor
          key={section.uid}
          sections={sections}
          section={section}
          position={String(index + 1)}
          onSave={(next) => {
            onChange(sections.map((s) => (s.uid === section.uid ? next : s)));
          }}
          onRemove={() => {
            onChange(sections.filter((s) => s.uid !== section.uid));
          }}
        />
      ))}
    </>
  );
}

export function FormDesigner({ mode }: { readonly mode: DesignMode }): JSX.Element {
  const [settings, setSettings] = useState(() => settingsOf(mode));
  const [sections, setSections] = useState(() =>
    mode.kind === 'new' ? [newSection()] : sectionsOf(mode.template.definition),
  );
  const [problems, setProblems] = useState<string[]>([]);
  const { action, save } = useDesignSave(mode);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const code = mode.kind === 'new' ? settings.code : null;
    const found = designProblems({ code, name: settings.name, sections });
    setProblems(found);
    if (found.length === 0) save(bodyOf(settings, sections, mode), settings.code);
  };
  return (
    <form noValidate onSubmit={submit} className="flex max-w-4xl flex-col gap-6">
      <Problems problems={problems} />
      {action.error === null ? null : <FormError error={action.error} />}
      <SettingsFields
        settings={settings}
        template={mode.kind === 'new' ? null : mode.template}
        onChange={setSettings}
      />
      <Sections sections={sections} onChange={setSections} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setSections([...sections, newSection()]);
          }}
        >
          Agregar sección
        </Button>
        <SubmitButton label="Guardar borrador" pendingLabel="Guardando…" pending={action.pending} />
      </div>
      {action.dialog}
    </form>
  );
}

/** El diseñador para corregir un borrador o para crear la versión siguiente de un formato. */
export function TemplateDesigner(props: {
  readonly id: string;
  readonly kind: 'edit' | 'version';
}): JSX.Element {
  const template = useFormTemplate(props.id);
  return (
    <QueryState query={template} loadingLabel="Cargando el formato">
      {(data) => <FormDesigner mode={{ kind: props.kind, template: data }} />}
    </QueryState>
  );
}
