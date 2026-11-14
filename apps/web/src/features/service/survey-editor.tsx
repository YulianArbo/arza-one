'use client';

import type { Survey } from '@arza/contracts';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import {
  CheckField,
  DialogForm,
  Fields,
  useDialogForm,
  type FieldSpec,
} from '../projects/form-bits';
import { useServiceAction } from './queries';

// Cambiar la encuesta de satisfacción (B29, decisión 9): los textos de las tres preguntas y si se
// envía o no. La estructura es fija: recomendación de 0 a 10, satisfacción de 1 a 5 y comentario.

type TextKey = 'name' | 'recommend' | 'satisfaction' | 'comment';

const TEXTS: readonly FieldSpec<TextKey>[] = [
  { key: 'name', field: 'name', id: 'encuesta-nombre', label: 'Nombre de la encuesta' },
  {
    key: 'recommend',
    field: 'recommend_question',
    id: 'encuesta-recomienda',
    label: 'Pregunta de recomendación (0 a 10)',
  },
  {
    key: 'satisfaction',
    field: 'satisfaction_question',
    id: 'encuesta-satisfaccion',
    label: 'Pregunta de satisfacción (1 a 5)',
  },
  {
    key: 'comment',
    field: 'comment_question',
    id: 'encuesta-comentario',
    label: 'Invitación a comentar',
  },
];

function textProblems(values: Readonly<Record<TextKey, string>>): Record<string, string> {
  const found: Record<string, string> = {};
  for (const spec of TEXTS) {
    if (values[spec.key].trim().length < (spec.key === 'name' ? 3 : 5))
      found[spec.field] = 'Escriba este texto.';
  }
  return found;
}

/** Los textos y el encendido de la encuesta, con la versión que se vio. */
function useSurveyEditor(survey: Survey, onDone: () => void) {
  const api = useApiClient();
  const [active, setActive] = useState(survey.is_active);
  const save = useServiceAction<object>(async (body, csrfToken) => {
    await api.put(`/v1/surveys/${survey.id}`, { body, version: survey.version, csrfToken });
  }, onDone);
  const start = {
    name: survey.name,
    recommend: survey.recommend_question,
    satisfaction: survey.satisfaction_question,
    comment: survey.comment_question,
  };
  const form = useDialogForm(start, textProblems, (values) => {
    save.execute({
      name: values.name.trim(),
      recommend_question: values.recommend.trim(),
      satisfaction_question: values.satisfaction.trim(),
      comment_question: values.comment.trim(),
      is_active: active,
    });
  });
  return { active, setActive, save, form };
}

export function SurveyEditor(props: {
  readonly survey: Survey;
  readonly onDone: () => void;
}): JSX.Element {
  const { active, setActive, save, form } = useSurveyEditor(props.survey, props.onDone);
  return (
    <DialogForm
      problems={form.problems}
      fields={TEXTS}
      action={save}
      submitLabel="Guardar la encuesta"
      onSubmit={form.submit}
    >
      <Fields
        specs={TEXTS}
        values={form.values}
        problems={form.problems}
        onChange={(key, value) => {
          form.set({ [key]: value });
        }}
      />
      <CheckField
        id="encuesta-activa"
        label="Enviar la encuesta al resolver cada tiquete"
        checked={active}
        onChange={setActive}
      />
    </DialogForm>
  );
}
