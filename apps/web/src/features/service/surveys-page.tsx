'use client';

import type { Survey, SurveyResults } from '@arza/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  FormField,
  SimpleTable,
  TableCell,
  TableRow,
} from '@arza/ui';
import { Smile } from 'lucide-react';
import { useState, type JSX, type SubmitEvent } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { RecordDialog } from '../organization/record-dialog';
import { useSurveyResults, useSurveys } from './care-queries';
import { ServiceNav } from './service-nav';
import { SurveyEditor } from './survey-editor';

// Encuestas de satisfacción y NPS (B29, FT-SAC-003): el NPS y el promedio de satisfacción del
// periodo, cada respuesta, y los textos de la encuesta que llega al resolver un tiquete.

/** «7,5» con coma decimal. */
function decimalText(value: number): string {
  return String(value).replace('.', ',');
}

function Metric(props: {
  readonly label: string;
  readonly value: string;
  readonly hint: string;
}): JSX.Element {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-6">
        <span className="text-sm text-muted-foreground">{props.label}</span>
        <span className="text-3xl font-semibold tabular-nums">{props.value}</span>
        <span className="text-xs text-muted-foreground">{props.hint}</span>
      </CardContent>
    </Card>
  );
}

function Summary({ results }: { readonly results: SurveyResults }): JSX.Element {
  const { summary } = results;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Metric
        label="NPS"
        value={summary.nps === null ? '—' : String(summary.nps)}
        hint="% que recomiendan (9 y 10) menos % que no (0 a 6). Va de -100 a 100."
      />
      <Metric
        label="Satisfacción"
        value={
          summary.satisfaction_avg === null ? '—' : `${decimalText(summary.satisfaction_avg)} / 5`
        }
        hint="Promedio de la pregunta de 1 a 5."
      />
      <Metric
        label="Respondidas"
        value={`${String(summary.answered)} de ${String(summary.sent)}`}
        hint="Respondidas y enviadas en el periodo."
      />
      <Metric
        label="Promotores · pasivos · detractores"
        value={`${String(summary.promoters)} · ${String(summary.passives)} · ${String(summary.detractors)}`}
        hint="9 y 10 · 7 y 8 · 0 a 6."
      />
    </div>
  );
}

function scoreTone(score: number): 'success' | 'warning' | 'destructive' {
  if (score >= 9) return 'success';
  return score >= 7 ? 'warning' : 'destructive';
}

function Answers({ results }: { readonly results: SurveyResults }): JSX.Element {
  if (results.data.length === 0) {
    return (
      <EmptyState
        icon={<Smile />}
        title="Nadie ha respondido en este periodo"
        description="Al resolver un tiquete, quien lo pidió recibe la encuesta por correo."
      />
    );
  }
  return (
    <SimpleTable
      caption="Respuestas del periodo"
      scrollLabel="Respuestas; desplácese a los lados para ver todas las columnas"
      headers={['Tiquete', 'Cliente', 'Recomendación', 'Satisfacción', 'Comentario', 'Respondió']}
    >
      {results.data.map((answer) => (
        <TableRow key={answer.id}>
          <TableCell>{answer.ticket.code}</TableCell>
          <TableCell>{answer.party?.name ?? '—'}</TableCell>
          <TableCell>
            <Badge tone={scoreTone(answer.score)}>{String(answer.score)}</Badge>
          </TableCell>
          <TableCell>{`${String(answer.satisfaction)} / 5`}</TableCell>
          <TableCell className="whitespace-pre-line">{answer.comment ?? '—'}</TableCell>
          <TableCell>{formatDateTime(answer.answered_at)}</TableCell>
        </TableRow>
      ))}
    </SimpleTable>
  );
}

function Period(props: { readonly onApply: (from: string, to: string) => void }): JSX.Element {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    props.onApply(from, to);
  };
  return (
    <form
      onSubmit={submit}
      role="search"
      className="grid gap-3 sm:grid-cols-[12rem_12rem_auto] sm:items-end"
    >
      <FormField
        id="encuestas-desde"
        label="Desde"
        type="date"
        value={from}
        onChange={(event) => {
          setFrom(event.target.value);
        }}
      />
      <FormField
        id="encuestas-hasta"
        label="Hasta"
        type="date"
        value={to}
        onChange={(event) => {
          setTo(event.target.value);
        }}
      />
      <Button type="submit" variant="outline">
        Ver
      </Button>
    </form>
  );
}

function Results(props: { readonly from: string; readonly to: string }): JSX.Element {
  const results = useSurveyResults(props.from, props.to);
  return (
    <QueryState query={results} loadingLabel="Calculando el NPS">
      {(data) => (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Del {formatDate(data.from)} al {formatDate(data.to)}.
          </p>
          <Summary results={data} />
          <Answers results={data} />
        </div>
      )}
    </QueryState>
  );
}

function SurveyCard({
  survey,
  canManage,
}: {
  readonly survey: Survey;
  readonly canManage: boolean;
}): JSX.Element {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">{survey.name}</CardTitle>
        <Badge tone={survey.is_active ? 'success' : 'neutral'}>
          {survey.is_active ? 'Se envía' : 'Apagada'}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p>1. {survey.recommend_question}</p>
        <p>2. {survey.satisfaction_question}</p>
        <p>3. {survey.comment_question}</p>
        {canManage ? (
          <RecordDialog
            triggerLabel="Cambiar la encuesta"
            variant="outline"
            title="Encuesta de satisfacción"
            description="Los cambios valen para las próximas encuestas que se envíen."
          >
            {(close) => <SurveyEditor survey={survey} onDone={close} />}
          </RecordDialog>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function SurveysPage(): JSX.Element {
  const [period, setPeriod] = useState({ from: '', to: '' });
  const surveys = useSurveys();
  return (
    <div className="flex flex-col gap-4">
      <ServiceNav current="surveys" />
      <PageHeader
        title="Encuestas y NPS"
        description="Al resolver un tiquete, quien lo pidió recibe esta encuesta por correo. Sus respuestas alimentan el indicador de satisfacción."
      />
      <Period
        onApply={(from, to) => {
          setPeriod({ from, to });
        }}
      />
      <Results key={`${period.from}|${period.to}`} from={period.from} to={period.to} />
      <QueryState query={surveys} loadingLabel="Cargando la encuesta">
        {(data) => (
          <>
            {data.data.map((survey) => (
              <SurveyCard key={survey.id} survey={survey} canManage={data.can_manage} />
            ))}
          </>
        )}
      </QueryState>
    </div>
  );
}
