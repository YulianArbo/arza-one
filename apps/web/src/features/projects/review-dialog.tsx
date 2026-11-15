'use client';

import {
  CODE_REVIEW_CHECKLIST,
  reviewResultSchema,
  type CheckAnswer,
  type ProjectItem,
  type ReviewResult,
} from '@arza/contracts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Radio,
} from '@arza/ui';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { Choice, DialogForm, TextInput, optional, optionsOf, useDialogForm } from './form-bits';
import { CHECK_ANSWERS, REVIEW_RESULTS, itemLabel } from './labels';
import { useProjectAction } from './queries';

// Revisión de código con la Lista de Revisión de Código FT-TEC-002 (B27, ficha 17.8): un compañero
// responde cada punto (cumple, no cumple, no aplica) y decide si se aprueba o requiere cambios. Con
// un punto que no cumple, no se aprueba. La plataforma genera el registro con su PDF.

const SUMMARY = [
  { field: 'reference_url', id: 'revision-enlace', label: 'Solicitud de cambios' },
  { field: 'answers', id: 'revision-punto-0-yes', label: 'Puntos de la lista' },
  { field: 'result', id: 'revision-resultado', label: 'Resultado' },
];

type Answers = readonly (CheckAnswer | '')[];

function problemsOf(url: string, answers: Answers, result: ReviewResult): Record<string, string> {
  const found: Record<string, string> = {};
  if (!/^https:\/\/\S+$/u.test(url.trim())) {
    found['reference_url'] = 'Pegue el enlace completo, que empiece por https://';
  }
  if (answers.includes('')) found['answers'] = 'Responda todos los puntos de la lista.';
  if (result === 'approved' && answers.includes('no')) {
    found['result'] = 'Con puntos que no cumplen, marque «Requiere cambios».';
  }
  return found;
}

function CheckPoint(props: {
  readonly index: number;
  readonly label: string;
  readonly value: CheckAnswer | '';
  readonly onValue: (value: CheckAnswer) => void;
}): JSX.Element {
  const name = `revision-punto-${String(props.index)}`;
  return (
    <fieldset className="flex flex-col gap-1 border-b pb-2">
      <legend className="text-sm">
        {String(props.index + 1)}. {props.label}
      </legend>
      <div className="flex flex-wrap gap-4">
        {(Object.keys(CHECK_ANSWERS) as CheckAnswer[]).map((answer) => (
          <label key={answer} className="flex items-center gap-2 text-sm">
            <Radio
              id={`${name}-${answer}`}
              name={name}
              checked={props.value === answer}
              onChange={() => {
                props.onValue(answer);
              }}
            />
            {CHECK_ANSWERS[answer]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface ReviewValues {
  readonly url: string;
  readonly answers: Answers;
  readonly result: string;
  readonly notes: string;
}

interface FormProps {
  readonly projectId: string;
  readonly item: ProjectItem;
  readonly onDone: () => void;
}

const INITIAL: ReviewValues = {
  url: '',
  answers: CODE_REVIEW_CHECKLIST.map(() => ''),
  result: 'approved',
  notes: '',
};

function useReviewForm(props: FormProps) {
  const api = useApiClient();
  const save = useProjectAction<object>(async (body, csrfToken) => {
    await api.post(`/v1/projects/${props.projectId}/code-reviews`, { body, csrfToken });
  }, props.onDone);
  const form = useDialogForm(
    INITIAL,
    (values) => problemsOf(values.url, values.answers, reviewResultSchema.parse(values.result)),
    (values) => {
      save.execute({
        item_id: props.item.id,
        reference_url: values.url.trim(),
        answers: values.answers,
        result: values.result,
        notes: optional(values.notes),
      });
    },
  );
  return { save, form };
}

function CheckList(props: {
  readonly answers: Answers;
  readonly onChange: (answers: Answers) => void;
}): JSX.Element {
  return (
    <>
      {CODE_REVIEW_CHECKLIST.map((label, index) => (
        <CheckPoint
          key={label}
          index={index}
          label={label}
          value={props.answers[index] ?? ''}
          onValue={(value) => {
            props.onChange(props.answers.map((current, at) => (at === index ? value : current)));
          }}
        />
      ))}
    </>
  );
}

function ReviewForm(props: FormProps): JSX.Element {
  const { save, form } = useReviewForm(props);
  const { values, problems } = form;
  return (
    <DialogForm
      problems={problems}
      fields={SUMMARY}
      action={save}
      submitLabel="Guardar la revisión"
      onSubmit={form.submit}
    >
      <TextInput
        id="revision-enlace"
        label="Solicitud de cambios en el repositorio"
        type="url"
        value={values.url}
        error={problems['reference_url']}
        onValue={(url) => {
          form.set({ url });
        }}
      />
      {problems['answers'] === undefined ? null : (
        <p className="text-sm text-destructive">{problems['answers']}</p>
      )}
      <CheckList
        answers={values.answers}
        onChange={(answers) => {
          form.set({ answers });
        }}
      />
      <ReviewOutcome form={form} />
    </DialogForm>
  );
}

function ReviewOutcome(props: {
  readonly form: ReturnType<typeof useReviewForm>['form'];
}): JSX.Element {
  const { form } = props;
  return (
    <>
      <Choice
        id="revision-resultado"
        label="Resultado"
        value={form.values.result}
        error={form.problems['result']}
        options={optionsOf(REVIEW_RESULTS)}
        onValue={(result) => {
          form.set({ result });
        }}
      />
      <TextInput
        id="revision-notas"
        label="Observaciones"
        value={form.values.notes}
        onValue={(notes) => {
          form.set({ notes });
        }}
      />
    </>
  );
}

export function ReviewDialog(props: {
  readonly projectId: string;
  readonly item: ProjectItem | null;
  readonly onClose: () => void;
}): JSX.Element {
  return (
    <Dialog
      open={props.item !== null}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Revisar el código de {props.item === null ? '' : itemLabel(props.item)}
          </DialogTitle>
          <DialogDescription>
            Lista de Revisión de Código FT-TEC-002. Quien hizo el ítem no revisa su propio código.
          </DialogDescription>
        </DialogHeader>
        {props.item === null ? null : (
          <ReviewForm projectId={props.projectId} item={props.item} onDone={props.onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
