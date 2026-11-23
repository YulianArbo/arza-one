'use client';

import type { PrivacyRequest } from '@arza/contracts';
import { Button } from '@arza/ui';
import type { JSX } from 'react';

import { FormError } from '../access/form-alert';
import type { AdminAction } from '../administration/admin-action';
import { useErasePersonalData, useExportPersonalData, useRequestStep } from './request-queries';
import {
  AnswerRequirementForm,
  ExtendForm,
  RequireForm,
  RespondForm,
  VerifyForm,
} from './request-step-forms';

// Las acciones de la ficha de una solicitud (B42): los pasos de un clic y los que abren un
// formulario, cada uno con la condición en que se muestra según el estado y el permiso.

interface Props {
  readonly request: PrivacyRequest;
}

export const OPEN_STATUSES = new Set(['received', 'verifying', 'in_progress']);
const OPEN = OPEN_STATUSES;

function OneClick(props: {
  readonly action: AdminAction<never, unknown>;
  readonly label: string;
  readonly run: () => void;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={props.action.pending}
        onClick={props.run}
      >
        {props.label}
      </Button>
      {props.action.error === null ? null : <FormError error={props.action.error} />}
      {props.action.dialog}
    </div>
  );
}

export function StepClick({
  request,
  action,
  label,
}: Props & { readonly action: string; readonly label: string }): JSX.Element {
  const step = useRequestStep(request, action);
  return (
    <OneClick
      action={step}
      label={label}
      run={() => {
        step.execute({});
      }}
    />
  );
}

export function ExportClick({ request }: Props): JSX.Element {
  const exporting = useExportPersonalData(request);
  return (
    <OneClick
      action={exporting}
      label="Preparar la entrega de sus datos"
      run={() => {
        exporting.execute(null);
      }}
    />
  );
}

function EraseConfirm({ request, onDone }: Props & { readonly onDone: () => void }): JSX.Element {
  const erase = useErasePersonalData(request, onDone);
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>
        Se vuelven anónimos los datos que se pueden suprimir y se revocan sus autorizaciones. Lo que
        la ley obliga a conservar (facturas, contratos, firmas, historia laboral) queda bloqueado
        con su motivo. Esto no se puede deshacer.
      </p>
      <OneClick
        action={erase}
        label="Sí, suprimir los datos"
        run={() => {
          erase.execute(null);
        }}
      />
    </div>
  );
}

export interface DialogSpec {
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly render: (close: () => void) => JSX.Element;
}

export type Can = (code: string) => boolean;

/** Cada paso con un formulario: cuándo se muestra y qué abre. */
const DIALOGS: readonly {
  readonly show: (request: PrivacyRequest, can: Can) => boolean;
  readonly spec: (request: PrivacyRequest) => DialogSpec;
}[] = [
  {
    show: (r) => r.status === 'received' || r.status === 'verifying',
    spec: (r) => ({
      label: 'Verificar la identidad',
      title: `Identidad del titular de ${r.code}`,
      description: 'Relacione la solicitud con la persona registrada en Terceros.',
      render: (close) => <VerifyForm request={r} onDone={close} />,
    }),
  },
  {
    show: (r) => OPEN.has(r.status) && r.kind === 'claim' && r.requirement === null,
    spec: (r) => ({
      label: 'Pedir que complete el reclamo',
      title: `Completar ${r.code}`,
      description: 'Dentro de los 5 días hábiles siguientes a recibirlo.',
      render: (close) => <RequireForm request={r} onDone={close} />,
    }),
  },
  {
    show: (r) => OPEN.has(r.status) && r.paused,
    spec: (r) => ({
      label: 'Registrar lo que completó',
      title: `Reclamo ${r.code} completo`,
      description: 'El plazo vuelve a correr desde hoy.',
      render: (close) => <AnswerRequirementForm request={r} onDone={close} />,
    }),
  },
  {
    show: (r) => OPEN.has(r.status) && !r.extended && !r.paused,
    spec: (r) => ({
      label: 'Ampliar el plazo',
      title: `Prórroga de ${r.code}`,
      description: 'Una sola vez y antes de que venza.',
      render: (close) => <ExtendForm request={r} onDone={close} />,
    }),
  },
  {
    show: (r, can) => r.status === 'in_progress' && !r.paused && can('privacy.request.respond'),
    spec: (r) => ({
      label: 'Responder',
      title: `Respuesta a ${r.code}`,
      description: 'Escriba la respuesta completa y clara para el titular.',
      render: (close) => <RespondForm request={r} onDone={close} />,
    }),
  },
  {
    show: (r, can) =>
      r.status === 'in_progress' &&
      r.right === 'erase' &&
      r.erasure === null &&
      can('privacy.data.erase'),
    spec: (r) => ({
      label: 'Suprimir sus datos',
      title: `Suprimir los datos de ${r.party?.name ?? 'el titular'}`,
      description: 'Ley 1581 de 2012, art. 8.',
      render: (close) => <EraseConfirm request={r} onDone={close} />,
    }),
  },
];

export function dialogsOf(request: PrivacyRequest, can: Can): DialogSpec[] {
  return DIALOGS.filter((item) => item.show(request, can)).map((item) => item.spec(request));
}
