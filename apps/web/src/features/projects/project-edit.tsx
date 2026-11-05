'use client';

import type { ProjectDetail } from '@arza/contracts';
import { Card, CardContent, CardHeader, CardTitle } from '@arza/ui';
import { useRouter } from 'next/navigation';
import { useState, type JSX, type SubmitEvent } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { FormSummary } from '../../components/form-summary';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { DATA_FIELDS, ProjectDataFields } from './project-fields';
import {
  updateBody,
  updateProblems,
  valuesFromDetail,
  type ProjectValues,
} from './project-form-values';
import { PROJECT_PATHS } from './labels';
import { useProject, useProjectAction, useProjectOptions } from './queries';

// Edición del proyecto (B26): sus datos, el presupuesto y el líder. El contrato y el cliente no
// cambian después de creado.

function useEditForm(project: ProjectDetail) {
  const api = useApiClient();
  const router = useRouter();
  const [values, setValues] = useState(() => valuesFromDetail(project));
  const [problems, setProblems] = useState<Record<string, string>>({});
  const save = useProjectAction<object>(
    async (body, csrfToken) =>
      api.put(`/v1/projects/${project.id}`, { body, version: project.version, csrfToken }),
    () => {
      router.push(PROJECT_PATHS.project(project.id));
    },
  );
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = updateProblems(values);
    setProblems(found);
    if (Object.keys(found).length === 0) save.execute(updateBody(values));
  };
  const set = (patch: Partial<ProjectValues>): void => {
    setValues({ ...values, ...patch });
  };
  return { values, problems, save, submit, set };
}

function EditForm({ project }: { readonly project: ProjectDetail }): JSX.Element {
  const people = useProjectOptions().data?.people ?? [];
  const { values, problems, save, submit, set } = useEditForm(project);
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <FormSummary problems={problems} fields={DATA_FIELDS} />
      {save.error === null ? null : <FormError error={save.error} />}
      <Card>
        <CardHeader>
          <CardTitle>Datos del proyecto</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectDataFields values={values} problems={problems} people={people} set={set} />
        </CardContent>
      </Card>
      <div>
        <SubmitButton label="Guardar" pendingLabel="Guardando…" pending={save.pending} />
      </div>
      {save.dialog}
    </form>
  );
}

export function EditProject({ id }: { readonly id: string }): JSX.Element {
  const project = useProject(id);
  return (
    <QueryState query={project} loadingLabel="Cargando el proyecto">
      {(data) => (
        <div className="flex flex-col gap-4">
          <PageHeader
            title={`Editar ${data.code}`}
            description={`${data.name} · ${data.party.name}`}
          />
          <EditForm project={data} />
        </div>
      )}
    </QueryState>
  );
}
