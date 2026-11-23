'use client';

import {
  QUOTE_TIMEFRAMES,
  SITE_SERVICES,
  formReceiptSchema,
  type FormNotice,
  type FormReceipt,
} from '@arza/contracts';
import { Alert, AlertDescription, LoadingState, SelectField, TextareaField } from '@arza/ui';
import { useMutation } from '@tanstack/react-query';
import { useState, type JSX, type ReactNode, type SubmitEvent } from 'react';

import { FormSummary } from '../../components/form-summary';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import {
  ConsentBox,
  EMPTY_VISITOR,
  Honeypot,
  VisitorFields,
  useFormNotice,
  visitorBody,
  visitorProblems,
  visitorSummary,
  type VisitorValues,
} from './site-form-parts';

// Formularios de contacto y cotización del sitio (B41, ficha 17.18; decisión 7). Al enviarlos, la
// referencia aparece en pantalla y la confirmación llega al correo; un consultor de Comercial
// recibe la tarea de contactar a la persona.

type Kind = 'contact' | 'quote';

interface Values extends VisitorValues {
  readonly detail: string;
  readonly service: string;
  readonly timeframe: string;
}

const SERVICE_OPTIONS = Object.entries(SITE_SERVICES).map(([value, label]) => ({ value, label }));
const TIMEFRAME_OPTIONS = Object.entries(QUOTE_TIMEFRAMES).map(([value, label]) => ({
  value,
  label,
}));

function problemsOf(kind: Kind, values: Values): Record<string, string> {
  const found = visitorProblems(values);
  const min = kind === 'contact' ? 10 : 20;
  if (values.detail.trim().length < min)
    found['detail'] = `Cuéntenos un poco más (al menos ${String(min)} letras).`;
  return found;
}

function bodyOf(kind: Kind, values: Values, notice: FormNotice): object {
  const base = visitorBody(values, notice);
  if (kind === 'contact') return { ...base, message: values.detail.trim() };
  return {
    ...base,
    service: values.service,
    timeframe: values.timeframe,
    description: values.detail.trim(),
  };
}

function Received({ receipt }: { readonly receipt: FormReceipt }): JSX.Element {
  return (
    <Alert tone="success" role="status">
      <AlertDescription className="flex flex-col gap-2">
        <span>
          Recibimos su solicitud. Su referencia es <strong>{receipt.code}</strong>.
        </span>
        <span>
          En unos minutos le llega la confirmación al correo. Un consultor le escribirá para
          continuar.
        </span>
      </AlertDescription>
    </Alert>
  );
}

function useSiteForm(kind: Kind) {
  const api = useApiClient();
  const [values, setValues] = useState<Values>({
    ...EMPTY_VISITOR,
    detail: '',
    service: 'custom_software',
    timeframe: 'quarter',
  });
  const [problems, setProblems] = useState<Record<string, string>>({});
  const send = useMutation({
    mutationFn: (body: object) =>
      api.post(`/v1/public/forms/${kind}`, { body, schema: formReceiptSchema }),
  });
  const set = (patch: Partial<Values>): void => {
    setValues({ ...values, ...patch });
  };
  const submit = (notice: FormNotice) => (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = problemsOf(kind, values);
    setProblems(found);
    if (Object.keys(found).length === 0) send.mutate(bodyOf(kind, values, notice));
  };
  return { values, problems, set, submit, send };
}

function QuoteChoices(props: {
  readonly values: Values;
  readonly set: (patch: Partial<Values>) => void;
}): JSX.Element {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField
        id="cotizar-servicio"
        label="Servicio que le interesa"
        options={SERVICE_OPTIONS}
        value={props.values.service}
        onChange={(event) => {
          props.set({ service: event.target.value });
        }}
      />
      <SelectField
        id="cotizar-plazo"
        label="¿Cuándo lo necesita?"
        options={TIMEFRAME_OPTIONS}
        value={props.values.timeframe}
        onChange={(event) => {
          props.set({ timeframe: event.target.value });
        }}
      />
    </div>
  );
}

interface SiteFormProps {
  readonly kind: Kind;
  readonly notice: FormNotice;
  readonly prefix: string;
  readonly detailLabel: string;
  readonly submitLabel: string;
  readonly extra?: (values: Values, set: (patch: Partial<Values>) => void) => ReactNode;
}

/** Detalle, autorización y campo trampa: lo que sigue a los datos de la persona. */
function DetailAndConsent(props: {
  readonly form: SiteFormProps;
  readonly values: Values;
  readonly problems: Record<string, string>;
  readonly set: (patch: Partial<Values>) => void;
}): JSX.Element {
  const { form, values, problems, set } = props;
  return (
    <>
      <TextareaField
        id={`${form.prefix}-detalle`}
        label={form.detailLabel}
        value={values.detail}
        error={problems['detail'] ?? null}
        onChange={(event) => {
          set({ detail: event.target.value });
        }}
      />
      <ConsentBox
        prefix={form.prefix}
        notice={form.notice}
        checked={values.accepts}
        problem={problems['accept_privacy']}
        onChange={(accepts) => {
          set({ accepts });
        }}
      />
      <Honeypot
        prefix={form.prefix}
        value={values.nickname}
        onChange={(nickname) => {
          set({ nickname });
        }}
      />
    </>
  );
}

function SiteForm(props: SiteFormProps): JSX.Element {
  const { values, problems, set, submit, send } = useSiteForm(props.kind);
  if (send.data !== undefined) return <Received receipt={send.data} />;
  const summary = [
    ...visitorSummary(props.prefix),
    { field: 'detail', id: `${props.prefix}-detalle`, label: props.detailLabel },
    { field: 'accept_privacy', id: `${props.prefix}-acepta`, label: 'Autorización' },
  ];
  return (
    <form noValidate onSubmit={submit(props.notice)} className="relative flex flex-col gap-4">
      <FormSummary problems={problems} fields={summary} />
      {send.isError ? <FormError error={send.error} /> : null}
      <VisitorFields prefix={props.prefix} values={values} problems={problems} set={set} />
      {props.extra?.(values, set)}
      <DetailAndConsent form={props} values={values} problems={problems} set={set} />
      <SubmitButton label={props.submitLabel} pendingLabel="Enviando…" pending={send.isPending} />
    </form>
  );
}

/** El formulario, cuando el sitio tiene su aviso de autorización publicado. */
function WithNotice(props: { readonly children: (notice: FormNotice) => ReactNode }) {
  const query = useFormNotice();
  if (query.data === undefined && !query.isError) return <LoadingState label="Cargando" />;
  const notice = query.data?.notice ?? null;
  if (notice === null) {
    return (
      <Alert tone="info">
        <AlertDescription>
          El formulario no está disponible en este momento. Escríbanos por los medios de contacto.
        </AlertDescription>
      </Alert>
    );
  }
  return <>{props.children(notice)}</>;
}

export function ContactForm(): JSX.Element {
  return (
    <WithNotice>
      {(notice) => (
        <SiteForm
          kind="contact"
          notice={notice}
          prefix="contacto"
          detailLabel="Su mensaje"
          submitLabel="Enviar mensaje"
        />
      )}
    </WithNotice>
  );
}

export function QuoteForm(): JSX.Element {
  return (
    <WithNotice>
      {(notice) => (
        <SiteForm
          kind="quote"
          notice={notice}
          prefix="cotizar"
          detailLabel="Cuéntenos de su proyecto"
          submitLabel="Solicitar cotización"
          extra={(values, set) => <QuoteChoices values={values} set={set} />}
        />
      )}
    </WithNotice>
  );
}
