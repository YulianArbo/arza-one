'use client';

import {
  AI_USE_CASES,
  aiPromptListResponseSchema,
  aiUseCaseSchema,
  createdResponseSchema,
  type AiPrompt,
  type AiPromptListResponse,
  type AiUseCase,
} from '@arza/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
  SelectField,
  TextareaField,
} from '@arza/ui';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { bogotaMoment } from '../direction/direction-queries';
import { useAssistantAction, useAssistantQuery } from './assistant-queries';
import { PROMPT_STATUS_LABELS, USE_CASE_LABELS } from './labels';
import { useTextForm } from './text-form';

// Instrucciones del asistente (B47): cada uso tiene una instrucción de fábrica; Calidad o el
// administrador escriben otra versión y una persona distinta la aprueba para que rija. Las reglas
// de seguridad (citar fuentes, tratar los documentos como datos, no decidir) no se editan.

const USE_CASES = Object.keys(AI_USE_CASES) as AiUseCase[];
const MIN_BODY = 20;

function useCreatePrompt() {
  const api = useApiClient();
  return useAssistantAction(
    async (input: { use_case: AiUseCase; body: string }, csrfToken) =>
      api.post('/v1/ai/prompts', { body: input, schema: createdResponseSchema, csrfToken }),
    'La instrucción quedó en borrador. Otra persona debe aprobarla.',
  );
}

function UseCaseSelect(props: {
  readonly value: AiUseCase;
  readonly onChange: (value: AiUseCase) => void;
}): JSX.Element {
  return (
    <SelectField
      id="instruccion-uso"
      label="Uso"
      value={props.value}
      options={USE_CASES.map((key) => ({ value: key, label: USE_CASE_LABELS[key] }))}
      onChange={(event) => {
        props.onChange(aiUseCaseSchema.parse(event.target.value));
      }}
    />
  );
}

function NewPromptForm(): JSX.Element {
  const create = useCreatePrompt();
  const [useCase, setUseCase] = useState<AiUseCase>('doc_search');
  const form = useTextForm(MIN_BODY, 'Escriba la instrucción (al menos 20 caracteres).', (body) => {
    create.execute({ use_case: useCase, body });
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nueva versión de una instrucción</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-3" onSubmit={form.submit} noValidate>
          <UseCaseSelect value={useCase} onChange={setUseCase} />
          <TextareaField
            id="instruccion-texto"
            label="Instrucción"
            rows={5}
            maxLength={4000}
            value={form.value}
            error={form.problem}
            onChange={(event) => {
              form.change(event.target.value);
            }}
          />
          <Button
            type="submit"
            className="h-auto min-h-9 self-start py-2 text-left whitespace-normal"
            disabled={create.pending}
          >
            Guardar borrador (otra persona la aprueba)
          </Button>
          {create.error === null ? null : <FormError error={create.error} />}
        </form>
      </CardContent>
      {create.dialog}
    </Card>
  );
}

function PromptItem({ prompt }: { readonly prompt: AiPrompt }): JSX.Element {
  const api = useApiClient();
  const approve = useAssistantAction(async (id: string, csrfToken) => {
    await api.post(`/v1/ai/prompts/${id}/approve`, { body: {}, csrfToken });
  }, 'La instrucción quedó aprobada y rige desde ahora.');
  return (
    <li className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Versión {prompt.version}</span>
        <Badge tone={prompt.status === 'approved' ? 'success' : 'neutral'}>
          {PROMPT_STATUS_LABELS[prompt.status]}
        </Badge>
        <span className="text-muted-foreground">
          Escrita por {prompt.created_by?.name ?? '—'} el {bogotaMoment(prompt.created_at)}
          {prompt.approved_by === null ? '' : ` · aprobada por ${prompt.approved_by.name}`}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-sm">{prompt.body}</p>
      {prompt.status === 'draft' ? (
        <div>
          <Button
            variant="outline"
            disabled={approve.pending}
            onClick={() => {
              approve.execute(prompt.id);
            }}
          >
            Aprobar
          </Button>
        </div>
      ) : null}
      {approve.error === null ? null : <FormError error={approve.error} />}
      {approve.dialog}
    </li>
  );
}

function UseCasePrompts(props: {
  readonly useCase: AiUseCase;
  readonly data: AiPromptListResponse;
}): JSX.Element {
  const versions = props.data.data.filter((prompt) => prompt.use_case === props.useCase);
  const factory = props.data.defaults.find((entry) => entry.use_case === props.useCase);
  const governs = versions.some((prompt) => prompt.status === 'approved');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{USE_CASE_LABELS[props.useCase]}</CardTitle>
        <CardDescription>
          {governs ? 'Rige la versión aprobada.' : 'Rige la instrucción de fábrica.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">De fábrica: {factory?.body ?? '—'}</p>
        <ul className="flex flex-col gap-3">
          {versions.map((prompt) => (
            <PromptItem key={prompt.id} prompt={prompt} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function PromptsPage(): JSX.Element {
  const list = useAssistantQuery('/v1/ai/prompts', aiPromptListResponseSchema);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Instrucciones del asistente"
        description="El tono y el formato de cada uso. Las reglas de seguridad del asistente no se pueden cambiar."
      />
      <NewPromptForm />
      <QueryState query={list} loadingLabel="Cargando las instrucciones">
        {(data) => (
          <div className="flex flex-col gap-4">
            {USE_CASES.map((useCase) => (
              <UseCasePrompts key={useCase} useCase={useCase} data={data} />
            ))}
          </div>
        )}
      </QueryState>
    </div>
  );
}
