'use client';

import { publicSurveySchema, type PublicSurvey } from '@arza/contracts';
import {
  Alert,
  AlertDescription,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  LoadingState,
  TextareaField,
} from '@arza/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type JSX, type SubmitEvent } from 'react';

import { FormSummary } from '../../components/form-summary';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { useLinkToken } from '../access/link-token';
import { SubmitButton } from '../access/submit-button';

// La encuesta de satisfacción que abre el cliente desde el enlace del correo, sin sesión (B29,
// decisiones 8 y 9): qué tan probable es que nos recomiende (0 a 10), qué tan satisfecho quedó
// (1 a 5) y un comentario. Se responde una sola vez. La llave va en el cuerpo de cada petición.

const SCORES = Array.from({ length: 11 }, (_, index) => index);
const RATINGS = [1, 2, 3, 4, 5];

const SUMMARY_FIELDS = [
  { field: 'score', id: 'encuesta-recomendacion-0', label: 'Recomendación' },
  { field: 'satisfaction', id: 'encuesta-satisfaccion-1', label: 'Satisfacción' },
];

function useSurvey(token: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: ['encuesta-cliente'],
    queryFn: () =>
      api.post('/v1/public/surveys/view', { body: { token }, schema: publicSurveySchema }),
    retry: false,
  });
}

interface ScaleProps {
  readonly name: string;
  readonly legend: string;
  readonly values: readonly number[];
  readonly selected: number | null;
  readonly problem: string | undefined;
  readonly ends: readonly [string, string];
  readonly onSelect: (value: number) => void;
}

function ScaleOption(props: ScaleProps & { readonly value: number }): JSX.Element {
  const id = `${props.name}-${String(props.value)}`;
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer flex-col items-center gap-1 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10"
    >
      <input
        id={id}
        type="radio"
        name={props.name}
        value={props.value}
        checked={props.selected === props.value}
        onChange={() => {
          props.onSelect(props.value);
        }}
      />
      {String(props.value)}
    </label>
  );
}

/** Una escala de números para elegir uno, con sus extremos explicados. */
function Scale(props: ScaleProps): JSX.Element {
  const errorId = `${props.name}-error`;
  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-describedby={props.problem === undefined ? undefined : errorId}
    >
      <legend className="font-medium">{props.legend}</legend>
      <div className="flex flex-wrap gap-2">
        {props.values.map((value) => (
          <ScaleOption key={value} {...props} value={value} />
        ))}
      </div>
      <p className="flex justify-between text-xs text-muted-foreground">
        <span>{props.ends[0]}</span>
        <span>{props.ends[1]}</span>
      </p>
      {props.problem === undefined ? null : (
        <p id={errorId} className="text-sm text-destructive">
          {props.problem}
        </p>
      )}
    </fieldset>
  );
}

function problemsOf(score: number | null, satisfaction: number | null): Record<string, string> {
  const found: Record<string, string> = {};
  if (score === null) found['score'] = 'Elija un número de 0 a 10.';
  if (satisfaction === null) found['satisfaction'] = 'Elija un número de 1 a 5.';
  return found;
}

/** Las respuestas elegidas, sus problemas y el envío (una sola vez). */
function useAnswer(token: string) {
  const api = useApiClient();
  const [score, setScore] = useState<number | null>(null);
  const [satisfaction, setSatisfaction] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [problems, setProblems] = useState<Record<string, string>>({});
  const answer = useMutation({
    mutationFn: (body: object) => api.post('/v1/public/surveys/answer', { body }),
  });
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = problemsOf(score, satisfaction);
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    const text = comment.trim();
    answer.mutate({ token, score, satisfaction, comment: text.length >= 3 ? text : null });
  };
  return {
    score,
    setScore,
    satisfaction,
    setSatisfaction,
    comment,
    setComment,
    problems,
    answer,
    submit,
  };
}

function CommentField(props: {
  readonly label: string;
  readonly form: ReturnType<typeof useAnswer>;
}): JSX.Element {
  return (
    <TextareaField
      id="encuesta-comentario"
      label={props.label}
      value={props.form.comment}
      onChange={(event) => {
        props.form.setComment(event.target.value);
      }}
    />
  );
}

function AnswerForm(props: { readonly survey: PublicSurvey; readonly token: string }): JSX.Element {
  const form = useAnswer(props.token);
  if (form.answer.isSuccess) return <Thanks />;
  return (
    <form noValidate onSubmit={form.submit} className="flex flex-col gap-6">
      <FormSummary problems={form.problems} fields={SUMMARY_FIELDS} />
      {form.answer.isError ? <FormError error={form.answer.error} /> : null}
      <Scale
        name="encuesta-recomendacion"
        legend={props.survey.recommend_question}
        values={SCORES}
        selected={form.score}
        problem={form.problems['score']}
        ends={['Nada probable', 'Muy probable']}
        onSelect={form.setScore}
      />
      <Scale
        name="encuesta-satisfaccion"
        legend={props.survey.satisfaction_question}
        values={RATINGS}
        selected={form.satisfaction}
        problem={form.problems['satisfaction']}
        ends={['Nada satisfecho', 'Muy satisfecho']}
        onSelect={form.setSatisfaction}
      />
      <CommentField label={props.survey.comment_question} form={form} />
      <SubmitButton
        label="Enviar mi respuesta"
        pendingLabel="Enviando…"
        pending={form.answer.isPending}
      />
    </form>
  );
}

function Thanks(): JSX.Element {
  return (
    <Alert tone="success">
      <AlertDescription>¡Gracias! Recibimos su respuesta. Nos ayuda a mejorar.</AlertDescription>
    </Alert>
  );
}

const CLOSED: Readonly<Record<'answered' | 'expired', string>> = {
  answered: 'Esta encuesta ya se respondió. ¡Gracias!',
  expired: 'El enlace de esta encuesta ya venció.',
};

function SurveyView(props: { readonly token: string }): JSX.Element {
  const survey = useSurvey(props.token);
  if (survey.isPending) return <LoadingState label="Cargando la encuesta" />;
  if (survey.isError) return <FormError error={survey.error} />;
  const data = survey.data;
  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <p className="text-sm text-muted-foreground">{data.company}</p>
        <CardTitle>¿Cómo le fue con su solicitud {data.ticket_code}?</CardTitle>
        <p className="text-sm">{data.ticket_subject}</p>
      </CardHeader>
      <CardContent>
        {data.state === 'open' ? (
          <AnswerForm survey={data} token={props.token} />
        ) : (
          <Alert tone="info">
            <AlertDescription>{CLOSED[data.state]}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

export function PublicSurveyPage(): JSX.Element {
  const token = useLinkToken();
  if (token === undefined) return <LoadingState label="Leyendo el enlace" />;
  if (token === null) {
    return (
      <Alert tone="warning">
        <AlertDescription>
          El enlace no está completo. Ábralo de nuevo desde el correo que le enviamos.
        </AlertDescription>
      </Alert>
    );
  }
  return <SurveyView token={token} />;
}
