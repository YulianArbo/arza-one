'use client';

import { type Deliverable, type DeliveryOptions, type ProjectDetail } from '@arza/contracts';
import { Alert, AlertDescription } from '@arza/ui';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { QueryState } from '../administration/query-state';
import {
  ChoiceFields,
  DialogForm,
  Fields,
  optional,
  optionsOf,
  useDialogForm,
  type ChoiceSpec,
  type FieldSpec,
} from './form-bits';
import { DELIVERY_ENVIRONMENTS } from './labels';
import { useDeliveryOptions, useProjectAction } from './queries';

// Entregar al cliente (B27, decisiones 1 a 5): se elige la persona del cliente que recibe y firma
// el acta (un firmante autorizado de Terceros, con correo y documento), el ambiente, los pendientes
// y un mensaje para el correo. La plataforma genera el acta FT-TEC-001 y, en segundos, el cliente
// recibe el enlace para firmarla con un código.

interface Props {
  readonly project: ProjectDetail;
  readonly deliverable: Deliverable;
  readonly onDone: () => void;
}

function Notes({ options }: { readonly options: DeliveryOptions }): JSX.Element {
  return (
    <p className="text-sm text-muted-foreground">
      El cliente tiene {String(options.respond_days)} días para responder.{' '}
      {options.tacit_acceptance
        ? 'Si no responde, el entregable queda aceptado tácitamente, como lo prevé el contrato.'
        : 'Si no responde, usted recibe un aviso para reenviar el acta o comunicarse con él.'}
    </p>
  );
}

interface DeliverValues {
  readonly signerId: string;
  readonly environment: string;
  readonly pending: string;
  readonly message: string;
}

const TEXTS: readonly FieldSpec<'pending' | 'message'>[] = [
  {
    key: 'pending',
    field: 'pending_note',
    id: 'entrega-pendientes',
    label: 'Pendientes y fechas de solución',
  },
  { key: 'message', field: 'message', id: 'entrega-mensaje', label: 'Mensaje para el cliente' },
];

function choicesOf(options: DeliveryOptions): ChoiceSpec<'signerId' | 'environment'>[] {
  return [
    {
      key: 'signerId',
      field: 'signer_id',
      id: 'entrega-firmante',
      label: 'Quién recibe por el cliente',
      hint: 'Firmantes autorizados del cliente en Terceros, con correo y documento.',
      options: [
        { value: '', label: 'Elija a la persona' },
        ...options.signers.map((signer) => ({
          value: signer.id,
          label: signer.ready ? signer.name : `${signer.name} (le falta correo o documento)`,
        })),
      ],
    },
    {
      key: 'environment',
      field: 'environment',
      id: 'entrega-ambiente',
      label: 'Ambiente',
      options: optionsOf(DELIVERY_ENVIRONMENTS),
    },
  ];
}

function useDeliver(props: Props & { readonly options: DeliveryOptions }) {
  const api = useApiClient();
  const ready = props.options.signers.filter((signer) => signer.ready);
  const path = `/v1/projects/${props.project.id}/deliverables/${props.deliverable.id}/actions/deliver`;
  const deliver = useProjectAction<object>(async (body, csrfToken) => {
    await api.post(path, { body, version: props.deliverable.version, csrfToken });
  }, props.onDone);
  const initial: DeliverValues = {
    signerId: ready.length === 1 ? (ready[0]?.id ?? '') : '',
    environment: 'production',
    pending: '',
    message: '',
  };
  const check = (values: DeliverValues): Record<string, string> =>
    values.signerId === '' ? { signer_id: 'Elija quién recibe por el cliente.' } : {};
  const form = useDialogForm(initial, check, (values) => {
    deliver.execute({
      signer_id: values.signerId,
      environment: values.environment,
      pending_note: optional(values.pending),
      message: optional(values.message),
    });
  });
  return { deliver, form };
}

function Form(props: Props & { readonly options: DeliveryOptions }): JSX.Element {
  const { deliver, form } = useDeliver(props);
  const choices = choicesOf(props.options);
  const change = (key: keyof DeliverValues, value: string): void => {
    form.set({ [key]: value });
  };
  return (
    <DialogForm
      problems={form.problems}
      fields={choices}
      action={deliver}
      submitLabel="Entregar y enviar el acta"
      onSubmit={form.submit}
    >
      <ChoiceFields
        specs={choices}
        values={form.values}
        problems={form.problems}
        onChange={change}
      />
      <Fields specs={TEXTS} values={form.values} problems={form.problems} onChange={change} />
      <Notes options={props.options} />
    </DialogForm>
  );
}

export function DeliverForm(props: Props): JSX.Element {
  const options = useDeliveryOptions(props.project.id, true);
  return (
    <QueryState query={options} loadingLabel="Cargando los firmantes del cliente">
      {(data) => {
        if (!data.form_ready) {
          return (
            <Alert tone="warning">
              <AlertDescription>
                El formato FT-TEC-001 no está publicado. Pida a Calidad que lo publique en
                Documentos › Formatos.
              </AlertDescription>
            </Alert>
          );
        }
        if (data.signers.length === 0) {
          return (
            <Alert tone="warning">
              <AlertDescription>
                El cliente no tiene firmantes autorizados. Regístrelos en Terceros, con su correo y
                su documento.
              </AlertDescription>
            </Alert>
          );
        }
        return <Form {...props} options={data} />;
      }}
    </QueryState>
  );
}
