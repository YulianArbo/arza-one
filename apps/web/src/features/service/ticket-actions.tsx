'use client';

import type { TicketDetail } from '@arza/contracts';
import { Button } from '@arza/ui';
import type { JSX } from 'react';

import { FormError } from '../access/form-alert';
import { RecordDialog } from '../organization/record-dialog';
import { AssignForm, TextStepForm, useStep, type TextStep } from './ticket-step-forms';

// Acciones del tiquete (B28): solo las que el estado y los permisos admiten (la API lo vuelve a
// comprobar). Las que piden un dato abren un diálogo; las demás se hacen con un clic.

interface Props {
  readonly ticket: TicketDetail;
}

function OneClick(props: Props & { readonly action: string; readonly label: string }): JSX.Element {
  const step = useStep(props.ticket, props.action);
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={step.pending}
        onClick={() => {
          step.execute({});
        }}
      >
        {props.label}
      </Button>
      {step.error === null ? null : <FormError error={step.error} />}
      {step.dialog}
    </div>
  );
}

interface DialogSpec {
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly render: (close: () => void) => JSX.Element;
}

function DialogStep({ spec }: { readonly spec: DialogSpec }): JSX.Element {
  return (
    <RecordDialog
      triggerLabel={spec.label}
      variant="outline"
      title={spec.title}
      description={spec.description}
    >
      {spec.render}
    </RecordDialog>
  );
}

const WAIT: TextStep = {
  action: 'wait',
  field: 'note',
  label: 'Qué necesita del cliente (opcional)',
  submitLabel: 'Poner en espera',
  optional: true,
};
const RESOLVE: TextStep = {
  action: 'resolve',
  field: 'resolution',
  label: 'Cómo se resolvió',
  submitLabel: 'Resolver',
};
const REOPEN: TextStep = {
  action: 'reopen',
  field: 'reason',
  label: 'Por qué se reabre',
  submitLabel: 'Reabrir',
};

function textDialog(
  ticket: TicketDetail,
  step: TextStep,
  spec: Omit<DialogSpec, 'render'>,
): DialogSpec {
  return {
    ...spec,
    render: (close) => <TextStepForm ticket={ticket} step={step} onDone={close} />,
  };
}

/** Asignar y escalar (hasta el nivel 3). */
function assignDialogs(ticket: TicketDetail): DialogSpec[] {
  if (!ticket.can.assign) return [];
  const assign: DialogSpec = {
    label: 'Asignar',
    title: `Asignar ${ticket.code}`,
    description: 'A una persona de Servicio al cliente o al Líder técnico.',
    render: (close) => <AssignForm ticket={ticket} escalate={false} onDone={close} />,
  };
  const escalate: DialogSpec = {
    label: 'Escalar',
    title: `Escalar ${ticket.code}`,
    description: `Sube al nivel ${String(ticket.level + 1)} y lo recibe quien usted elija.`,
    render: (close) => <AssignForm ticket={ticket} escalate onDone={close} />,
  };
  return ticket.level < 3 ? [assign, escalate] : [assign];
}

/** Poner en espera, resolver y reabrir. */
function textDialogs(ticket: TicketDetail): DialogSpec[] {
  const { can, status } = ticket;
  const specs: DialogSpec[] = [];
  if (can.work && status === 'in_progress') {
    specs.push(
      textDialog(ticket, WAIT, {
        label: 'Poner en espera del cliente',
        title: 'En espera del cliente',
        description:
          'El reloj se pausa hasta que el cliente responda. Lo que escriba se envía al cliente.',
      }),
    );
  }
  if (can.work && (status === 'in_progress' || status === 'waiting_customer')) {
    specs.push(
      textDialog(ticket, RESOLVE, {
        label: 'Resolver',
        title: `Resolver ${ticket.code}`,
        description: 'Se cierra solo en cinco días hábiles si nadie lo reabre.',
      }),
    );
  }
  if (can.reopen) {
    specs.push(
      textDialog(ticket, REOPEN, {
        label: 'Reabrir',
        title: `Reabrir ${ticket.code}`,
        description: 'Vuelve a «En curso» y el reloj sigue con lo que le quedaba.',
      }),
    );
  }
  return specs;
}

/** Los pasos de un clic: empezar, reanudar y cerrar. */
function oneClicks(ticket: TicketDetail): { action: string; label: string }[] {
  const { can, status } = ticket;
  return [
    ...(can.work && status === 'assigned' ? [{ action: 'start', label: 'Empezar' }] : []),
    ...(can.work && status === 'waiting_customer' ? [{ action: 'resume', label: 'Reanudar' }] : []),
    ...(can.close ? [{ action: 'close', label: 'Cerrar' }] : []),
  ];
}

export function TicketActions({ ticket }: Props): JSX.Element | null {
  const dialogs = [...assignDialogs(ticket), ...textDialogs(ticket)];
  const clicks = oneClicks(ticket);
  if (dialogs.length === 0 && clicks.length === 0) return null;
  return (
    <div
      className="flex flex-wrap items-start gap-2"
      role="group"
      aria-label="Acciones del tiquete"
    >
      {dialogs.map((spec) => (
        <DialogStep key={spec.label} spec={spec} />
      ))}
      {clicks.map((click) => (
        <OneClick key={click.action} ticket={ticket} action={click.action} label={click.label} />
      ))}
    </div>
  );
}
