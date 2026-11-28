'use client';

import {
  AFFECTED_PEOPLE,
  QUICK_REPORT_KINDS,
  quickReportResponseSchema,
  quickReportSchema,
  type QuickReport as QuickReportInput,
  type QuickReportKind,
  type QuickReportResponse,
} from '@arza/contracts';
import { Button, FormField, HighlightCard, PageHeader, Radio, TextareaField } from '@arza/ui';
import Link from 'next/link';
import { useCallback, useState, type SubmitEvent, type JSX } from 'react';

import { FormSummary } from '../../components/form-summary';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { problemsOf } from '../finance/ledger-ui';
import { EvidencePicker, type EvidenceState } from './evidence-picker';
import { useSstAction } from './sst-queries';

// Reporte desde el celular (B37, decisión 10; ficha 17.14: «en menos de un minuto»). Tres datos:
// qué pasa, dónde y una foto opcional. En un accidente se indica además quién se lesionó. El
// reporte no es anónimo, pero solo lo ve SST.

const FIELDS = [
  { field: 'kind', id: 'reporte-tipo-unsafe_condition', label: 'Qué va a reportar' },
  { field: 'description', id: 'reporte-que', label: 'Qué pasa' },
  { field: 'location', id: 'reporte-donde', label: 'Dónde' },
  { field: 'affected', id: 'reporte-afectado-self', label: 'Quién se lesionó' },
];

const HINTS: Readonly<Record<QuickReportKind, string>> = {
  unsafe_condition:
    'Algo del lugar que puede causar un accidente: un cable suelto, un piso mojado.',
  unsafe_act: 'Algo que alguien hace de forma insegura.',
  incident: 'Algo que casi causa una lesión, pero nadie salió herido.',
  accident: 'Alguien se lesionó. SST debe reportarlo a la ARL en dos días hábiles.',
};

const OPTION = 'flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-3';

function KindOption(props: {
  readonly kind: QuickReportKind;
  readonly checked: boolean;
  readonly onChange: (kind: QuickReportKind) => void;
}): JSX.Element {
  const id = `reporte-tipo-${props.kind}`;
  return (
    <div className={`${OPTION} has-[:checked]:border-primary`}>
      <Radio
        id={id}
        name="kind"
        value={props.kind}
        checked={props.checked}
        onChange={() => {
          props.onChange(props.kind);
        }}
        className="mt-1"
      />
      <label htmlFor={id} className="flex cursor-pointer flex-col">
        <span className="font-semibold">{QUICK_REPORT_KINDS[props.kind]}</span>
        <span className="text-sm text-muted-foreground">{HINTS[props.kind]}</span>
      </label>
    </div>
  );
}

function KindChoice(props: {
  readonly value: QuickReportKind;
  readonly onChange: (kind: QuickReportKind) => void;
}): JSX.Element {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Qué va a reportar</legend>
      {(Object.keys(QUICK_REPORT_KINDS) as QuickReportKind[]).map((kind) => (
        <KindOption
          key={kind}
          kind={kind}
          checked={props.value === kind}
          onChange={props.onChange}
        />
      ))}
    </fieldset>
  );
}

function AffectedChoice(): JSX.Element {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Quién se lesionó</legend>
      {(['self', 'other'] as const).map((value) => (
        <div key={value} className="flex min-h-11 items-center gap-3 rounded-xl border px-3">
          <Radio id={`reporte-afectado-${value}`} name="affected" value={value} />
          <label htmlFor={`reporte-afectado-${value}`}>{AFFECTED_PEOPLE[value]}</label>
        </div>
      ))}
    </fieldset>
  );
}

function Done(props: { readonly result: QuickReportResponse; readonly again: () => void }) {
  return (
    <HighlightCard title="Reporte enviado">
      <p role="status">
        Su reporte quedó con el código <strong>{props.result.code}</strong>. SST ya recibió el
        aviso; puede ver el avance en Mi espacio.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="outline" onClick={props.again}>
          Reportar otra cosa
        </Button>
        <Link className="font-semibold underline" href="/app/mi-espacio">
          Ir a Mi espacio
        </Link>
      </div>
    </HighlightCard>
  );
}

function valuesOf(form: FormData, kind: QuickReportKind, photo: string | null) {
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === 'string' ? value : '';
  };
  const affected = text('affected');
  return {
    kind,
    description: text('description'),
    location: text('location'),
    photo_file_id: photo,
    affected: kind === 'accident' && affected !== '' ? affected : 'none',
  };
}

function useReportAction(onDone: (result: QuickReportResponse) => void) {
  const api = useApiClient();
  const [key] = useState(() => crypto.randomUUID());
  return useSstAction(
    (body: QuickReportInput, csrfToken: string) =>
      api.post('/v1/sst/me/reports', {
        body,
        csrfToken,
        schema: quickReportResponseSchema,
        idempotencyKey: key,
      }),
    onDone,
  );
}

function ReportFields(props: {
  readonly kind: QuickReportKind;
  readonly problems: Record<string, string>;
}) {
  return (
    <>
      <TextareaField
        id="reporte-que"
        name="description"
        label="Qué pasa"
        hint="Cuente lo que vio, sin diagnósticos médicos."
        error={props.problems['description'] ?? null}
      />
      <FormField
        id="reporte-donde"
        name="location"
        label="Dónde"
        error={props.problems['location'] ?? null}
      />
      {props.kind === 'accident' ? <AffectedChoice /> : null}
    </>
  );
}

function ReportForm(props: { readonly onDone: (result: QuickReportResponse) => void }) {
  const [kind, setKind] = useState<QuickReportKind>('unsafe_condition');
  const [photo, setPhoto] = useState<EvidenceState>({ fileId: null, busy: false });
  const [problems, setProblems] = useState<Record<string, string>>({});
  const onPhoto = useCallback((state: EvidenceState) => {
    setPhoto(state);
  }, []);
  const action = useReportAction(props.onDone);
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = valuesOf(new FormData(event.currentTarget), kind, photo.fileId);
    const parsed = quickReportSchema.safeParse(values);
    setProblems(parsed.success ? {} : problemsOf(parsed.error));
    if (parsed.success) action.execute(parsed.data);
  };
  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={submit}>
      <FormSummary problems={problems} fields={FIELDS} />
      <KindChoice value={kind} onChange={setKind} />
      <ReportFields kind={kind} problems={problems} />
      <EvidencePicker
        id="reporte-foto"
        label="Foto (opcional)"
        accept="image/jpeg,image/png"
        onChange={onPhoto}
      />
      {action.error === null ? null : <FormError error={action.error} />}
      <SubmitButton
        label="Enviar reporte"
        pendingLabel={photo.busy ? 'Esperando la foto…' : 'Enviando…'}
        pending={action.pending || photo.busy}
        className="min-h-12 w-full sm:w-auto"
      />
      {action.dialog}
    </form>
  );
}

export function QuickReport(): JSX.Element {
  const [result, setResult] = useState<QuickReportResponse | null>(null);
  const [round, setRound] = useState(0);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <PageHeader
        title="Reportar a SST"
        description="Una condición o un acto inseguro, un incidente o un accidente. Toma menos de un minuto."
      />
      {result === null ? (
        <ReportForm key={round} onDone={setResult} />
      ) : (
        <Done
          result={result}
          again={() => {
            setResult(null);
            setRound((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}
