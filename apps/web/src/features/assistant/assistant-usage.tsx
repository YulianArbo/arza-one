'use client';

import {
  AI_OUTCOMES,
  AI_USE_CASES,
  aiRequestListResponseSchema,
  type AiRequestRow,
} from '@arza/contracts';
import {
  Badge,
  Card,
  CardContent,
  EmptyState,
  PageHeader,
  SelectField,
  SimpleTable,
  TableCell,
  TableRow,
} from '@arza/ui';
import { useState, type JSX } from 'react';

import { QueryState } from '../administration/query-state';
import { bogotaMoment } from '../direction/direction-queries';
import { useAssistantQuery } from './assistant-queries';
import {
  INPUT_CLASS_LABELS,
  OUTCOME_LABELS,
  OUTCOME_TONES,
  REVIEW_LABELS,
  USE_CASE_LABELS,
} from './labels';

// Registro de usos del asistente (B47, ficha 17.21: caso de uso, modelo y resultado). No guarda la
// pregunta, el texto enviado ni la respuesta (decisión 5). Consultarlo también queda auditado.

const ALL = '';

function optionsOf(labels: Readonly<Record<string, string>>) {
  return [
    { value: ALL, label: 'Todos' },
    ...Object.entries(labels).map(([value, label]) => ({ value, label })),
  ];
}

function UsageRow({ row }: { readonly row: AiRequestRow }): JSX.Element {
  return (
    <TableRow>
      <TableCell>{bogotaMoment(row.created_at)}</TableCell>
      <TableCell>{row.user?.name ?? '—'}</TableCell>
      <TableCell>{USE_CASE_LABELS[row.use_case]}</TableCell>
      <TableCell>
        <Badge tone={OUTCOME_TONES[row.outcome]}>{OUTCOME_LABELS[row.outcome]}</Badge>
      </TableCell>
      <TableCell>{row.model}</TableCell>
      <TableCell>
        {INPUT_CLASS_LABELS[row.input_class]} · {row.input_chars} caracteres · {row.redactions}{' '}
        datos borrados
      </TableCell>
      <TableCell>{row.sources.length}</TableCell>
      <TableCell>{row.review === null ? 'Sin decidir' : REVIEW_LABELS[row.review]}</TableCell>
    </TableRow>
  );
}

const HEADERS = [
  'Fecha',
  'Persona',
  'Uso',
  'Resultado',
  'Modelo',
  'Lo que se envió',
  'Fuentes citadas',
  'Decisión',
];

function usagePath(useCase: string, outcome: string): string {
  const query = new URLSearchParams({
    ...(useCase === ALL ? {} : { use_case: useCase }),
    ...(outcome === ALL ? {} : { outcome }),
  }).toString();
  return query === '' ? '/v1/ai/requests' : `/v1/ai/requests?${query}`;
}

function UsageList({ path }: { readonly path: string }): JSX.Element {
  const list = useAssistantQuery(path, aiRequestListResponseSchema);
  return (
    <QueryState query={list} loadingLabel="Cargando el registro">
      {(data) =>
        data.data.length === 0 ? (
          <EmptyState
            title="Sin usos registrados"
            description="Aquí aparecerá cada uso del asistente."
          />
        ) : (
          <Card>
            <CardContent className="pt-6">
              <SimpleTable headers={HEADERS} scrollLabel="Registro de usos">
                {data.data.map((row) => (
                  <UsageRow key={row.id} row={row} />
                ))}
              </SimpleTable>
            </CardContent>
          </Card>
        )
      }
    </QueryState>
  );
}

export function UsagePage(): JSX.Element {
  const [useCase, setUseCase] = useState(ALL);
  const [outcome, setOutcome] = useState(ALL);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Registro de usos del asistente"
        description="Quién usó el asistente, para qué, con qué modelo y qué resultado. No guarda las preguntas ni las respuestas."
      />
      <div className="flex flex-wrap gap-4">
        <SelectField
          id="registro-uso"
          label="Uso"
          value={useCase}
          options={optionsOf(AI_USE_CASES)}
          onChange={(event) => {
            setUseCase(event.target.value);
          }}
        />
        <SelectField
          id="registro-resultado"
          label="Resultado"
          value={outcome}
          options={optionsOf(AI_OUTCOMES)}
          onChange={(event) => {
            setOutcome(event.target.value);
          }}
        />
      </div>
      <UsageList path={usagePath(useCase, outcome)} />
    </div>
  );
}
