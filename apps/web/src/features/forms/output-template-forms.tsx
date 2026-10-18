'use client';

import {
  OUTPUT_ENGINES,
  outputEngineSchema,
  type OutputEngine,
  type OutputTemplate,
} from '@arza/contracts';
import { useState, type JSX, type SubmitEvent } from 'react';

import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { SelectField } from '../administration/select-field';
import { SourceUpload } from '../documents/source-upload';
import { TextInput } from '../organization/record-dialog';
import { useCreateOutputTemplate, useUpdateOutputTemplate } from './queries';

// Formularios de las plantillas de salida (B20): crear una (o su versión siguiente, con el mismo
// código) y corregir el borrador. El HTML lleva variables {{nombre}}; el Word, {nombre}.

const ENGINE_OPTIONS = Object.entries(OUTPUT_ENGINES).map(([value, label]) => ({ value, label }));
const VARIABLES_HINT =
  'Use los nombres internos de los campos: {{cliente}}, {{#each requisitos}}…{{/each}}, y además {{formato.codigo}}, {{registro.codigo}}, {{empresa.razon_social}}.';

export interface ContentValues {
  readonly code: string;
  readonly name: string;
  readonly engine: OutputEngine;
  readonly body: string;
  readonly fileId: string | null;
}

export const EMPTY_CONTENT: ContentValues = {
  code: '',
  name: '',
  engine: 'html',
  body: '',
  fileId: null,
};

function problemOf(values: ContentValues, creating: boolean): string | null {
  if (creating && !/^[A-Z][A-Z0-9-]{2,39}$/u.test(values.code)) {
    return 'Escriba el código en mayúsculas, como FT-COM-002.';
  }
  if (values.name.trim().length < 3) return 'Escriba el nombre de la plantilla.';
  if (values.engine === 'html' && values.body.trim() === '')
    return 'Escriba el HTML de la plantilla.';
  if (values.engine === 'docx' && values.fileId === null) {
    return 'Suba el Word de la plantilla y espere a que quede disponible.';
  }
  return null;
}

function contentBody(values: ContentValues) {
  const html = values.engine === 'html';
  return {
    name: values.name.trim(),
    body: html ? values.body : null,
    file_id: html ? null : values.fileId,
  };
}

interface FieldsProps {
  readonly values: ContentValues;
  readonly onChange: (values: ContentValues) => void;
}

function CodeAndEngine({ values, onChange }: FieldsProps): JSX.Element {
  return (
    <>
      <TextInput
        id="plantilla-codigo"
        label="Código"
        hint="Con un código que ya existe se crea su versión siguiente."
        value={values.code}
        onValue={(code) => {
          onChange({ ...values, code: code.toUpperCase() });
        }}
      />
      <SelectField
        id="plantilla-tipo"
        label="Tipo"
        value={values.engine}
        options={ENGINE_OPTIONS}
        onChange={(event) => {
          onChange({ ...values, engine: outputEngineSchema.parse(event.target.value) });
        }}
      />
    </>
  );
}

function Content({ values, onChange }: FieldsProps): JSX.Element {
  if (values.engine === 'docx') {
    const change = (fileId: string | null) => {
      onChange({ ...values, fileId });
    };
    return <SourceUpload label="Word de la plantilla (.docx)" current={null} onChange={change} />;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="plantilla-html" className="text-sm font-medium">
        HTML de la plantilla
      </label>
      <textarea
        id="plantilla-html"
        rows={10}
        value={values.body}
        aria-describedby="plantilla-html-ayuda"
        onChange={(event) => {
          onChange({ ...values, body: event.target.value });
        }}
        className="rounded-md border border-input bg-card px-3 py-2 font-mono text-xs"
      />
      <p id="plantilla-html-ayuda" className="text-xs text-muted-foreground">
        {VARIABLES_HINT}
      </p>
    </div>
  );
}

function ContentFields(props: FieldsProps & { readonly creating: boolean }): JSX.Element {
  const { values, onChange } = props;
  return (
    <>
      {props.creating ? <CodeAndEngine values={values} onChange={onChange} /> : null}
      <TextInput
        id="plantilla-nombre"
        label="Nombre"
        value={values.name}
        maxLength={200}
        onValue={(name) => {
          onChange({ ...values, name });
        }}
      />
      <Content values={values} onChange={onChange} />
    </>
  );
}

function Problem({ problem }: { readonly problem: string | null }): JSX.Element | null {
  return problem === null ? null : (
    <p role="alert" className="text-sm text-destructive">
      {problem}
    </p>
  );
}

export function CreateOutputForm(props: {
  readonly initial: ContentValues;
  readonly onDone: () => void;
}): JSX.Element {
  const [values, setValues] = useState(props.initial);
  const [problem, setProblem] = useState<string | null>(null);
  const create = useCreateOutputTemplate(props.onDone);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = problemOf(values, true);
    setProblem(found);
    if (found === null)
      create.execute({ code: values.code, engine: values.engine, ...contentBody(values) });
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <Problem problem={problem} />
      {create.error === null ? null : <FormError error={create.error} />}
      <ContentFields values={values} creating onChange={setValues} />
      <SubmitButton label="Guardar borrador" pendingLabel="Guardando…" pending={create.pending} />
      {create.dialog}
    </form>
  );
}

export function contentOf(template: OutputTemplate, withFile: boolean): ContentValues {
  const fileId = withFile ? (template.file?.id ?? null) : null;
  return {
    code: template.code,
    name: template.name,
    engine: template.engine,
    body: template.body ?? '',
    fileId,
  };
}

export function EditOutputForm(props: {
  readonly template: OutputTemplate;
  readonly onDone: () => void;
}): JSX.Element {
  const { template } = props;
  const [values, setValues] = useState(() => contentOf(template, true));
  const [problem, setProblem] = useState<string | null>(null);
  const update = useUpdateOutputTemplate(
    { id: template.id, version: template.version },
    props.onDone,
  );
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = problemOf(values, false);
    setProblem(found);
    if (found === null) update.execute(contentBody(values));
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <Problem problem={problem} />
      {update.error === null ? null : <FormError error={update.error} />}
      <ContentFields values={values} creating={false} onChange={setValues} />
      <SubmitButton label="Guardar borrador" pendingLabel="Guardando…" pending={update.pending} />
      {update.dialog}
    </form>
  );
}
