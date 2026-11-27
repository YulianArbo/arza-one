'use client';

import {
  PQRSF_TYPES,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type AiAnswer,
  type AiReview,
  type AiSuggestion,
} from '@arza/contracts';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  useToast,
} from '@arza/ui';
import { Check, Copy, X } from 'lucide-react';
import Link from 'next/link';
import { useState, type JSX } from 'react';

import { FormError } from '../access/form-alert';
import { useReview } from './assistant-queries';
import {
  OUTCOME_LABELS,
  OUTCOME_TONES,
  PROPOSAL_NOTICE,
  SOURCE_KIND_LABELS,
  sourcePath,
} from './labels';

// Propuesta del asistente (B47): el texto, la clasificación sugerida, las fuentes en que se basa y
// la decisión de la persona. Nada se guarda ni se envía desde aquí: la persona copia lo que le
// sirva y lo usa en la pantalla del registro.

function suggestionLines(suggestion: AiSuggestion): string[] {
  return [
    ...(suggestion.ticket_category === null
      ? []
      : [`Categoría: ${TICKET_CATEGORIES[suggestion.ticket_category]}`]),
    ...(suggestion.ticket_priority === null
      ? []
      : [`Prioridad: ${TICKET_PRIORITIES[suggestion.ticket_priority]}`]),
    ...(suggestion.pqrsf_type === null ? [] : [`Tipo: ${PQRSF_TYPES[suggestion.pqrsf_type]}`]),
    `Por qué: ${suggestion.reason}`,
  ];
}

function Sources({ answer }: { readonly answer: AiAnswer }): JSX.Element | null {
  if (answer.sources.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium">Fuentes</p>
      <ul className="flex flex-col gap-1 text-sm">
        {answer.sources.map((source) => (
          <li key={`${source.kind}-${source.id}`}>
            <Link
              href={sourcePath(source)}
              className="text-primary underline-offset-4 hover:underline"
            >
              {SOURCE_KIND_LABELS[source.kind]} {source.code} · {source.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

const NEWLINE = String.fromCharCode(10);

/** El texto de la propuesta para copiarlo a la pantalla del registro. */
function proposalText(answer: AiAnswer): string {
  const suggestion = answer.suggestion === null ? [] : suggestionLines(answer.suggestion);
  return [answer.text ?? '', ...suggestion].filter((line) => line !== '').join(NEWLINE);
}

function CopyButton({ answer }: { readonly answer: AiAnswer }): JSX.Element {
  const { notify } = useToast();
  const copy = (): void => {
    void navigator.clipboard.writeText(proposalText(answer)).then(() => {
      notify('Se copió la propuesta.');
    });
  };
  return (
    <Button variant="outline" onClick={copy}>
      <Copy aria-hidden="true" /> Copiar
    </Button>
  );
}

function ReviewButtons({ answer }: { readonly answer: AiAnswer }): JSX.Element | null {
  const review = useReview(answer.request_id);
  const [decided, setDecided] = useState(false);
  if (answer.outcome !== 'answered') return null;
  const done = review.pending || (decided && review.error === null);
  const decide = (decision: AiReview): void => {
    setDecided(true);
    review.execute(decision);
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Qué hace con la propuesta">
        <CopyButton answer={answer} />
        <Button
          variant="outline"
          disabled={done}
          onClick={() => {
            decide('accepted');
          }}
        >
          <Check aria-hidden="true" /> La usé
        </Button>
        <Button
          variant="outline"
          disabled={done}
          onClick={() => {
            decide('discarded');
          }}
        >
          <X aria-hidden="true" /> La descarto
        </Button>
      </div>
      {review.error === null ? null : <FormError error={review.error} />}
      {review.dialog}
    </div>
  );
}

export function AnswerCard({ answer }: { readonly answer: AiAnswer }): JSX.Element {
  return (
    <Card className="animate-enter">
      <CardHeader className="flex flex-row flex-wrap items-center gap-2">
        <CardTitle className="text-base">Propuesta del asistente</CardTitle>
        <Badge tone={OUTCOME_TONES[answer.outcome]}>{OUTCOME_LABELS[answer.outcome]}</Badge>
        {answer.rehearsal ? <Badge tone="warning">Modo de ensayo</Badge> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert tone="info">
          <AlertDescription>{PROPOSAL_NOTICE}</AlertDescription>
        </Alert>
        {answer.truncated ? (
          <Alert tone="warning">
            <AlertDescription>
              El texto era muy largo: el asistente solo leyó el comienzo.
            </AlertDescription>
          </Alert>
        ) : null}
        {answer.text === null ? null : <p className="whitespace-pre-wrap text-sm">{answer.text}</p>}
        {answer.suggestion === null ? null : (
          <ul className="flex flex-col gap-1 text-sm">
            {suggestionLines(answer.suggestion).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        <Sources answer={answer} />
        <ReviewButtons answer={answer} />
      </CardContent>
    </Card>
  );
}
