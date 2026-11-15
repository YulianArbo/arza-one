'use client';

import type { ProjectDetail } from '@arza/contracts';
import { Button, buttonVariants } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { NoteForm, type NoteFormSpec } from '../contracts/decision-forms';
import { RecordDialog } from '../organization/record-dialog';
import { CloseDialog, SettingsDialog } from './closing-actions';
import { PROJECT_PATHS } from './labels';
import { useProjectAction } from './queries';

// Acciones del proyecto (B26 y B27, ficha 17.8), según su estado; desde el B27, el control y el
// cierre. Solo las ve quien gestiona proyectos
// (Líder técnico). Sin contrato vigente, se pide la autorización de la Dirección antes de iniciar.
// La API vuelve a revisar cada paso.

interface Props {
  readonly project: ProjectDetail;
}

function useStep(project: ProjectDetail, action: string, onDone?: () => void) {
  const api = useApiClient();
  return useProjectAction<object>(
    (body, csrfToken) =>
      api.post(`/v1/projects/${project.id}/actions/${action}`, {
        body,
        version: project.version,
        csrfToken,
      }),
    onDone,
  );
}

function StepButton(props: Props & { readonly action: string; readonly label: string }) {
  const step = useStep(props.project, props.action);
  return (
    <>
      <Button
        type="button"
        disabled={step.pending}
        onClick={() => {
          step.execute({});
        }}
      >
        {props.label}
      </Button>
      {step.error === null ? null : <FormError error={step.error} />}
      {step.dialog}
    </>
  );
}

function ReasonAction(props: Props & { readonly action: string; readonly onDone: () => void }) {
  const step = useStep(props.project, props.action, props.onDone);
  const spec: NoteFormSpec = {
    idPrefix: `proyecto-${props.action}`,
    textField: 'reason',
    textLabel: 'Motivo',
    submitLabel: 'Confirmar',
    pendingLabel: 'Guardando…',
  };
  return <NoteForm spec={spec} action={step} />;
}

function ReasonDialog(
  props: Props & { readonly action: string; readonly label: string; readonly description: string },
): JSX.Element {
  return (
    <RecordDialog
      triggerLabel={props.label}
      variant="outline"
      title={`${props.label}: ${props.project.code}`}
      description={props.description}
    >
      {(close) => <ReasonAction project={props.project} action={props.action} onDone={close} />}
    </RecordDialog>
  );
}

/** Puede iniciar ya: contrato vigente o autorización de la Dirección. */
function mayStart(project: ProjectDetail): boolean {
  const inForce = project.contract_status === 'active' || project.contract_status === 'expiring';
  return inForce || project.authorization.status === 'granted';
}

function PlanningActions({ project }: Props): JSX.Element | null {
  if (mayStart(project)) {
    return <StepButton project={project} action="start" label="Iniciar el proyecto" />;
  }
  if (project.authorization.status === 'requested') return null;
  return (
    <ReasonDialog
      project={project}
      action="request-authorization"
      label="Pedir autorización a la Dirección"
      description="Sin contrato vigente, la Dirección decide en Mis tareas si el proyecto puede iniciar. Explique por qué."
    />
  );
}

function RunningActions({ project }: Props): JSX.Element {
  if (project.status === 'closing') {
    return (
      <>
        {project.can.close ? <CloseDialog project={project} /> : null}
        <StepButton project={project} action="resume" label="Volver a ejecución" />
      </>
    );
  }
  return (
    <>
      {project.status === 'in_progress' ? (
        <ReasonDialog
          project={project}
          action="risk"
          label="Marcar en riesgo"
          description="El proyecto sigue en ejecución, con una alerta y su motivo."
        />
      ) : null}
      {project.status === 'paused' ? null : (
        <ReasonDialog
          project={project}
          action="pause"
          label="Pausar"
          description="Mientras esté pausado, el tablero no se mueve ni corren iteraciones."
        />
      )}
      {project.status === 'in_progress' ? null : (
        <StepButton project={project} action="resume" label="Reanudar" />
      )}
      {project.can.close && project.status !== 'paused' ? (
        <StepButton project={project} action="start-closing" label="Pasar a cierre" />
      ) : null}
    </>
  );
}

export function ProjectActions({ project }: Props): JSX.Element | null {
  if (!project.can.update || project.status === 'closed') return null;
  return (
    <div className="flex flex-wrap items-start gap-2">
      {project.status === 'planning' ? (
        <PlanningActions project={project} />
      ) : (
        <RunningActions project={project} />
      )}
      <SettingsDialog project={project} />
      <Link
        href={PROJECT_PATHS.edit(project.id)}
        className={buttonVariants({ variant: 'outline' })}
      >
        Editar
      </Link>
    </div>
  );
}
