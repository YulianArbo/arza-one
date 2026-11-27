'use client';

import { useState, type SubmitEvent } from 'react';

// Formulario de un solo texto del asistente (B47): la pregunta o la instrucción. Revisa el largo
// mínimo antes de enviar y muestra el mensaje junto al campo (16.5).

export interface TextForm {
  readonly value: string;
  readonly problem: string | null;
  readonly change: (value: string) => void;
  readonly submit: (event: SubmitEvent<HTMLFormElement>) => void;
}

export function useTextForm(
  min: number,
  tooShort: string,
  onSubmit: (text: string) => void,
): TextForm {
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  return {
    value,
    problem,
    change: setValue,
    submit: (event) => {
      event.preventDefault();
      const text = value.trim();
      if (text.length < min) {
        setProblem(tooShort);
        return;
      }
      setProblem(null);
      onSubmit(text);
    },
  };
}
