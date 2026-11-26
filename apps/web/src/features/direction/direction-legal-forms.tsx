'use client';

import {
  evaluateLegalRequirementSchema,
  LEGAL_NORM_TYPES,
  LEGAL_RESULTS,
  legalEvaluationListResponseSchema,
  legalResultSchema,
  qmsCodeResponseSchema,
  qmsCreatedResponseSchema,
  resultNeedsAction,
  saveLegalRequirementSchema,
  type LegalRequirement,
  type LegalResult,
} from '@arza/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  SimpleTable,
  TableCell,
  TableRow,
} from '@arza/ui';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { QueryState } from '../administration/query-state';
import { HrDialogForm, optionsOf } from '../hr/hr-dialog';
import type { HrField } from '../hr/hr-form';
import { useQmsPeople, useQmsProcesses } from '../quality/quality-queries';
import { usePermissions } from '../session/permissions';
import { bogotaToday, DIRECTION_REFRESH, shownDate, useDirectionQuery } from './direction-queries';

// Formularios del normograma (B46, decisiones 6 y 7): registrar o editar un requisito, evaluarlo
// (un resultado parcial o negativo lleva su acción de mejora) y ver su historial.

type Options = readonly { value: string; label: string }[];

const NONE = { value: '', label: 'Sin asignar' };
const YES_NO = [
  { value: 'true', label: 'Sí' },
  { value: 'false', label: 'No' },
];

function emptyToNull(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}

function textFields(item?: LegalRequirement): HrField[] {
  return [
    {
      key: 'norm_type',
      label: 'Tipo de norma',
      options: optionsOf(LEGAL_NORM_TYPES),
      value: item?.norm_type ?? 'law',
    },
    { key: 'norm', label: 'Norma', value: item?.norm ?? '' },
    { key: 'issuer', label: 'Entidad que la expide', value: item?.issuer ?? '' },
    { key: 'article', label: 'Artículos (opcional)', value: item?.article ?? '' },
    { key: 'requirement', label: 'Qué exige a la empresa', value: item?.requirement ?? '' },
    {
      key: 'compliance_means',
      label: 'Cómo se cumple (opcional)',
      value: item?.compliance_means ?? '',
    },
  ];
}

function requirementFields(
  processes: Options,
  people: Options,
  item?: LegalRequirement,
): HrField[] {
  return [
    ...textFields(item),
    {
      key: 'process_id',
      label: 'Proceso',
      options: [NONE, ...processes],
      value: item?.process?.id ?? '',
    },
    {
      key: 'responsible_id',
      label: 'Responsable',
      options: [NONE, ...people],
      value: item?.responsible?.id ?? '',
    },
    {
      key: 'applies',
      label: '¿Aplica a la empresa?',
      options: YES_NO,
      value: String(item?.applies ?? true),
    },
  ];
}

function prepareRequirement(values: Record<string, string>): unknown {
  return {
    ...values,
    article: emptyToNull(values['article']),
    compliance_means: emptyToNull(values['compliance_means']),
    process_id: emptyToNull(values['process_id']),
    responsible_id: emptyToNull(values['responsible_id']),
    applies: values['applies'] !== 'false',
  };
}

export function RequirementForm({
  item,
}: {
  readonly item?: LegalRequirement;
}): JSX.Element | null {
  const api = useApiClient();
  const { canAll } = usePermissions();
  const allowed = canAll('qms.legal.manage');
  const processes = useQmsProcesses(allowed);
  const people = useQmsPeople(allowed);
  const editing = item !== undefined;
  return (
    <HrDialogForm
      allowed={allowed}
      label={editing ? 'Editar' : 'Registrar requisito'}
      title={editing ? `Editar ${item.code}` : 'Registrar un requisito legal'}
      description="El normograma reúne las normas que la empresa debe cumplir (RE-DG-001)."
      fields={requirementFields(processes, people, item)}
      schema={saveLegalRequirementSchema}
      prepare={prepareRequirement}
      run={(body, csrfToken) =>
        editing
          ? api.patch(`/v1/qms/legal-requirements/${item.id}`, {
              body,
              csrfToken,
              version: item.version,
            })
          : api.post('/v1/qms/legal-requirements', {
              body,
              csrfToken,
              schema: qmsCodeResponseSchema,
            })
      }
      submitLabel="Guardar"
      refresh={DIRECTION_REFRESH}
    />
  );
}

function evaluationFields(people: Options): HrField[] {
  return [
    { key: 'evaluated_on', label: 'Fecha de la evaluación', type: 'date', value: bogotaToday() },
    { key: 'result', label: 'Resultado', options: optionsOf(LEGAL_RESULTS), value: 'complies' },
    { key: 'evidence_note', label: 'Qué se revisó y dónde está la evidencia' },
    { key: 'action_description', label: 'Acción de mejora (si es parcial o no cumple)' },
    {
      key: 'action_responsible_id',
      label: 'Responsable de la acción',
      options: [NONE, ...people],
      value: '',
    },
    { key: 'action_due_on', label: 'Fecha compromiso de la acción', type: 'date' },
  ];
}

function prepareEvaluation(values: Record<string, string>): unknown {
  const parsed = legalResultSchema.safeParse(values['result']);
  const result: LegalResult = parsed.success ? parsed.data : 'complies';
  return {
    evaluated_on: values['evaluated_on'],
    result,
    evidence_note: values['evidence_note'],
    evidence_file_id: null,
    action: resultNeedsAction(result)
      ? {
          description: values['action_description'],
          responsible_id: values['action_responsible_id'],
          due_on: values['action_due_on'],
        }
      : null,
  };
}

export function EvaluateForm({ item }: { readonly item: LegalRequirement }): JSX.Element | null {
  const api = useApiClient();
  const { canAll } = usePermissions();
  const allowed = canAll('qms.legal.evaluate');
  const people = useQmsPeople(allowed);
  return (
    <HrDialogForm
      allowed={allowed}
      label="Evaluar"
      title={`Evaluar ${item.code} · ${item.norm}`}
      description="Si el resultado es parcial o no cumple, registre la acción de mejora: se abre en Calidad."
      fields={evaluationFields(people)}
      schema={evaluateLegalRequirementSchema}
      prepare={prepareEvaluation}
      run={(body, csrfToken) =>
        api.post(`/v1/qms/legal-requirements/${item.id}/evaluations`, {
          body,
          csrfToken,
          schema: qmsCreatedResponseSchema,
        })
      }
      submitLabel="Guardar evaluación"
      refresh={DIRECTION_REFRESH}
    />
  );
}

function HistoryTable({ id }: { readonly id: string }): JSX.Element {
  const query = useDirectionQuery(
    `/v1/qms/legal-requirements/${id}/evaluations`,
    legalEvaluationListResponseSchema,
  );
  return (
    <QueryState query={query} loadingLabel="Cargando las evaluaciones">
      {({ data }) =>
        data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no tiene evaluaciones.</p>
        ) : (
          <SimpleTable
            headers={['Fecha', 'Semestre', 'Resultado', 'Evidencia', 'Acción', 'Evaluó']}
            scrollLabel="Evaluaciones"
          >
            {data.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{shownDate(row.evaluated_on)}</TableCell>
                <TableCell>{row.period}</TableCell>
                <TableCell>{LEGAL_RESULTS[row.result]}</TableCell>
                <TableCell>{row.evidence_note}</TableCell>
                <TableCell>{row.action?.code ?? '—'}</TableCell>
                <TableCell>{row.evaluated_by.name}</TableCell>
              </TableRow>
            ))}
          </SimpleTable>
        )
      }
    </QueryState>
  );
}

export function EvaluationHistory({ item }: { readonly item: LegalRequirement }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setOpen(true);
        }}
      >
        Historial
      </Button>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Evaluaciones de {item.code}</DialogTitle>
          <DialogDescription>{item.norm}</DialogDescription>
        </DialogHeader>
        {open ? <HistoryTable id={item.id} /> : null}
      </DialogContent>
    </Dialog>
  );
}
