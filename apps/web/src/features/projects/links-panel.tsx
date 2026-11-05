'use client';

import {
  linkKindSchema,
  type LinkKind,
  type ProjectDetail,
  type ProjectLink,
} from '@arza/contracts';
import { Button, EmptyState } from '@arza/ui';
import { ExternalLink, Link2 } from 'lucide-react';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { optionsOf } from '../crm/labels';
import { RecordDialog } from '../organization/record-dialog';
import { Choice, DialogForm, Fields, summaryOf, type FieldSpec } from './form-bits';
import { LINK_KINDS } from './labels';
import { useProjectAction } from './queries';

// Enlaces del proyecto (B26, ficha 17.8): repositorio, entornos, diseño y documentación. El código
// de cada cliente vive en su repositorio; ARZA ONE guarda el enlace, no el código.

interface Props {
  readonly project: ProjectDetail;
}

const KIND_OPTIONS = optionsOf(linkKindSchema.options, LINK_KINDS);

const FIELDS: readonly FieldSpec<'label' | 'url'>[] = [
  { key: 'label', field: 'label', id: 'enlace-nombre', label: 'Nombre' },
  { key: 'url', field: 'url', id: 'enlace-direccion', label: 'Dirección', type: 'url' },
];

function problemsOf(values: { label: string; url: string }): Record<string, string> {
  const found: Record<string, string> = {};
  if (values.label.trim().length < 3) found['label'] = 'Escriba un nombre corto.';
  if (!/^https:\/\/\S+$/u.test(values.url.trim())) {
    found['url'] = 'Escriba la dirección completa, que empiece por https://';
  }
  return found;
}

function useLinkForm(project: ProjectDetail, onDone: () => void) {
  const api = useApiClient();
  const [kind, setKind] = useState<LinkKind>('repository');
  const [values, setValues] = useState({ label: '', url: '' });
  const [problems, setProblems] = useState<Record<string, string>>({});
  const add = useProjectAction<object>(async (body, csrfToken) => {
    await api.post(`/v1/projects/${project.id}/links`, { body, csrfToken });
  }, onDone);
  const submit = (): void => {
    const found = problemsOf(values);
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    add.execute({ kind, label: values.label.trim(), url: values.url.trim() });
  };
  return { kind, setKind, values, setValues, problems, add, submit };
}

function AddLink(props: Props & { readonly onDone: () => void }): JSX.Element {
  const { kind, setKind, values, setValues, problems, add, submit } = useLinkForm(
    props.project,
    props.onDone,
  );
  return (
    <DialogForm
      problems={problems}
      fields={summaryOf(FIELDS)}
      action={add}
      submitLabel="Agregar el enlace"
      onSubmit={submit}
    >
      <Choice
        id="enlace-tipo"
        label="Qué es"
        options={KIND_OPTIONS}
        value={kind}
        onValue={(value) => {
          setKind(value as LinkKind);
        }}
      />
      <Fields
        specs={FIELDS}
        values={values}
        problems={problems}
        onChange={(key, value) => {
          setValues({ ...values, [key]: value });
        }}
      />
    </DialogForm>
  );
}

function RemoveLink(props: Props & { readonly link: ProjectLink }): JSX.Element {
  const api = useApiClient();
  const remove = useProjectAction<undefined>((_args, csrfToken) =>
    api.delete(`/v1/projects/${props.project.id}/links/${props.link.id}`, { csrfToken }),
  );
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={remove.pending}
        aria-label={`Quitar el enlace ${props.link.label}`}
        onClick={() => {
          remove.execute(undefined);
        }}
      >
        Quitar
      </Button>
      {remove.error === null ? null : <FormError error={remove.error} />}
      {remove.dialog}
    </>
  );
}

function LinkItem(props: Props & { readonly link: ProjectLink }): JSX.Element {
  const { link } = props;
  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground">{LINK_KINDS[link.kind]}:</span>
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
      >
        {link.label}
        <ExternalLink aria-hidden="true" className="size-3" />
        <span className="sr-only">(se abre en otra pestaña)</span>
      </a>
      {props.project.can.update ? <RemoveLink project={props.project} link={link} /> : null}
    </li>
  );
}

export function LinksPanel({ project }: Props): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      {project.can.update ? (
        <div>
          <RecordDialog
            triggerLabel="Agregar un enlace"
            variant="outline"
            title="Nuevo enlace"
            description="Solo direcciones https. El código del cliente vive en su repositorio."
          >
            {(close) => <AddLink project={project} onDone={close} />}
          </RecordDialog>
        </div>
      ) : null}
      {project.links.length === 0 ? (
        <EmptyState
          icon={<Link2 />}
          title="Sin enlaces"
          description="Agregue el repositorio, los entornos y el diseño del proyecto."
        />
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {project.links.map((link) => (
            <LinkItem key={link.id} project={project} link={link} />
          ))}
        </ul>
      )}
    </div>
  );
}
