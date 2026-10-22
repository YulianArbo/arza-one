'use client';

import { createdResponseSchema, definitionProblems, type DefinitionView } from '@arza/contracts';
import { Alert, AlertDescription, AlertTitle, Badge, Button, FormField } from '@arza/ui';
import { useRouter } from 'next/navigation';
import { useState, type JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { useAdminAction } from '../administration/admin-action';
import { useRoles } from '../administration/queries';
import { QueryState } from '../administration/query-state';
import { createRequestOf, draftOf, updateRequestOf, type EditorDraft } from './editor-model';
import { DEFINITION_STATUS_LABELS, DEFINITION_STATUS_TONES, WF_PATHS } from './labels';
import { useDefinition, WF_KEYS } from './queries';
import { StateEditor, type Option } from './state-editor';
import { TransitionEditor } from './transition-editor';

// Editor básico de flujos (B15, ADR-011): formularios para los estados y las transiciones. Se
// guarda como borrador; publicar crea la versión vigente; una publicada se cambia con una versión
// nueva. Los problemas se muestran mientras se edita, con las mismas reglas de la API.

const REASON = 'Esta acción cambia cómo funciona un proceso.';

function useRoleOptions(): Option[] {
  const roles = useRoles();
  return (roles.data?.data ?? []).map((role) => ({ value: role.code, label: role.name }));
}

function useSaveDefinition(view: DefinitionView | null) {
  const api = useApiClient();
  const router = useRouter();
  return useAdminAction<EditorDraft, string>({
    run: async (draft, csrfToken) => {
      if (view === null) {
        const body = createRequestOf(draft);
        const created = await api.post('/v1/workflows', {
          body,
          schema: createdResponseSchema,
          csrfToken,
        });
        return created.id;
      }
      const body = updateRequestOf(draft);
      await api.patch(`/v1/workflows/${view.id}`, { body, csrfToken, version: view.row_version });
      return view.id;
    },
    invalidate: [WF_KEYS.definitions, ...(view === null ? [] : [WF_KEYS.definition(view.id)])],
    onSuccess: (id) => {
      if (view === null) router.push(WF_PATHS.definition(id));
    },
    reason: REASON,
  });
}

function useVersionActions(view: DefinitionView) {
  const api = useApiClient();
  const router = useRouter();
  return useAdminAction<'publish' | 'new-version', string>({
    run: async (action, csrfToken) => {
      const path = `/v1/workflows/${view.id}/actions/${action}`;
      if (action === 'publish') {
        await api.post(path, { body: {}, csrfToken, version: view.row_version });
        return view.id;
      }
      return (await api.post(path, { body: {}, schema: createdResponseSchema, csrfToken })).id;
    },
    invalidate: [WF_KEYS.definitions, WF_KEYS.definition(view.id)],
    onSuccess: (id) => {
      if (id !== view.id) router.push(WF_PATHS.definition(id));
    },
    reason: REASON,
  });
}

function Problems({ problems }: { readonly problems: readonly string[] }): JSX.Element {
  if (problems.length === 0) {
    return (
      <p role="status" className="text-sm text-success">
        El flujo está completo: se puede publicar.
      </p>
    );
  }
  return (
    <Alert tone="warning" role="status">
      <AlertTitle>Antes de publicar, corrija:</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-5">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function IdentityFields(props: {
  readonly draft: EditorDraft;
  readonly isNew: boolean;
  readonly set: (patch: Partial<EditorDraft>) => void;
}): JSX.Element {
  const { draft, set } = props;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <FormField
        id="flujo-nombre"
        label="Nombre del flujo"
        value={draft.name}
        onChange={(event) => {
          set({ name: event.target.value });
        }}
      />
      <FormField
        id="flujo-clave"
        label="Clave del flujo"
        hint="Minúsculas y puntos, como «compras.solicitud». No cambia después."
        disabled={!props.isNew}
        value={draft.key}
        onChange={(event) => {
          set({ key: event.target.value });
        }}
      />
      <FormField
        id="flujo-descripcion"
        label="Descripción"
        value={draft.description}
        onChange={(event) => {
          set({ description: event.target.value });
        }}
      />
    </div>
  );
}

function VersionBar({ view }: { readonly view: DefinitionView }): JSX.Element {
  const actions = useVersionActions(view);
  const isDraft = view.status === 'draft';
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Badge tone={DEFINITION_STATUS_TONES[view.status]}>
        {DEFINITION_STATUS_LABELS[view.status]} · versión {view.version}
      </Badge>
      <Button
        type="button"
        variant={isDraft ? 'primary' : 'outline'}
        disabled={actions.pending || (isDraft && view.problems.length > 0)}
        onClick={() => {
          actions.execute(isDraft ? 'publish' : 'new-version');
        }}
      >
        {isDraft ? 'Publicar esta versión' : 'Crear una versión nueva'}
      </Button>
      {actions.error === null ? null : <FormError error={actions.error} />}
      {actions.dialog}
    </div>
  );
}

/** Lo que falta para publicar y el botón de guardar el borrador. */
function DraftFooter(props: {
  readonly draft: EditorDraft;
  readonly view: DefinitionView | null;
}): JSX.Element {
  const save = useSaveDefinition(props.view);
  return (
    <>
      <Problems problems={definitionProblems(props.draft)} />
      {save.error === null ? null : <FormError error={save.error} />}
      <Button
        type="button"
        className="self-start"
        disabled={save.pending}
        onClick={() => {
          save.execute(props.draft);
        }}
      >
        Guardar el borrador
      </Button>
      {save.dialog}
    </>
  );
}

function EditorForm({ view }: { readonly view: DefinitionView | null }): JSX.Element {
  const [draft, setDraft] = useState<EditorDraft>(() => draftOf(view));
  const roles = useRoleOptions();
  const set = (patch: Partial<EditorDraft>): void => {
    setDraft({ ...draft, ...patch });
  };
  const editable = view === null || view.status === 'draft';
  return (
    <div className="flex flex-col gap-6">
      {view === null ? null : <VersionBar view={view} />}
      <fieldset disabled={!editable} className="flex flex-col gap-6">
        <IdentityFields draft={draft} isNew={view === null} set={set} />
        <StateEditor
          states={draft.states}
          roles={roles}
          onChange={(states) => {
            set({ states });
          }}
        />
        <TransitionEditor
          transitions={draft.transitions}
          states={draft.states}
          onChange={(transitions) => {
            set({ transitions });
          }}
        />
      </fieldset>
      {editable ? <DraftFooter draft={draft} view={view} /> : null}
    </div>
  );
}

export function NewDefinition(): JSX.Element {
  return (
    <>
      <PageHeader
        title="Nuevo flujo"
        description="Se guarda como borrador; publíquelo cuando esté completo."
      />
      <EditorForm view={null} />
    </>
  );
}

export function DefinitionEditor({ id }: { readonly id: string }): JSX.Element {
  const definition = useDefinition(id);
  return (
    <QueryState query={definition} loadingLabel="Cargando el flujo">
      {(data) => (
        <>
          <PageHeader
            title={data.name}
            description={`Clave ${data.key} · registros «${data.entity_type}»`}
          />
          <EditorForm key={`${data.id}-${String(data.row_version)}`} view={data} />
        </>
      )}
    </QueryState>
  );
}
