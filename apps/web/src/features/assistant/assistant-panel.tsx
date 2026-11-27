'use client';

import type { AiTargetUseCase } from '@arza/contracts';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@arza/ui';
import { Sparkles } from 'lucide-react';
import type { JSX } from 'react';

import { FormError } from '../access/form-alert';
import { usePermissions } from '../session/permissions';
import { AnswerCard } from './assistant-answer';
import { useAssist, useAssistantStatus } from './assistant-queries';
import { ACTION_LABELS } from './labels';

// Asistente dentro de la ficha de un documento, un tiquete o una PQRSF (B47). Solo aparece para
// quien puede usarlo y solo con los usos que el Oficial de datos activó. La API vuelve a revisar
// todo: este panel no es la barrera de seguridad.

interface Props {
  readonly targetId: string;
  readonly useCases: readonly AiTargetUseCase[];
}

function Actions(props: Props & { readonly enabled: readonly AiTargetUseCase[] }): JSX.Element {
  const assist = useAssist(props.targetId);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Qué puede hacer el asistente">
        {props.enabled.map((useCase) => (
          <Button
            key={useCase}
            variant="outline"
            disabled={assist.pending}
            onClick={() => {
              assist.execute(useCase);
            }}
          >
            <Sparkles aria-hidden="true" /> {ACTION_LABELS[useCase]}
          </Button>
        ))}
      </div>
      {assist.pending ? (
        <p className="text-sm text-muted-foreground" role="status">
          El asistente está trabajando…
        </p>
      ) : null}
      {assist.error === null ? null : <FormError error={assist.error} />}
      {assist.result === undefined || assist.pending ? null : (
        <AnswerCard key={assist.result.request_id} answer={assist.result} />
      )}
      {assist.dialog}
    </div>
  );
}

export function AssistantPanel(props: Props): JSX.Element | null {
  const { can } = usePermissions();
  const status = useAssistantStatus();
  if (!can('ai.assist.use') || status.data === undefined) return null;
  const active = new Set(status.data.enabled_use_cases);
  const enabled = props.useCases.filter((useCase) => active.has(useCase));
  if (enabled.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Asistente</CardTitle>
        <CardDescription>
          Le propone un resumen, un borrador o una clasificación con lo que usted puede ver aquí.
          Usted decide qué usar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Actions {...props} enabled={enabled} />
      </CardContent>
    </Card>
  );
}
