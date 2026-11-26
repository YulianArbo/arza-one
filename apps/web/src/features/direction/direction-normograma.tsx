'use client';

import {
  LEGAL_NORM_TYPES,
  LEGAL_RESULTS,
  legalRequirementListResponseSchema,
  type LegalRequirement,
  type LegalResult,
} from '@arza/contracts';
import { Badge, Button, PageHeader, SimpleTable, TableCell, TableRow } from '@arza/ui';
import type { JSX } from 'react';

import type { DownloadedFile } from '../../lib/api/api-client';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError, FormSuccess } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { save } from '../audit/audit-export-button';
import { useHrAction } from '../hr/hr-queries';
import { EvaluateForm, EvaluationHistory, RequirementForm } from './direction-legal-forms';
import { LegalImport } from './direction-legal-import';
import { shownDate, useDirectionQuery } from './direction-queries';

// Normograma y evaluación de cumplimiento (B46, ficha 17.17): cada requisito con su última
// evaluación; los que aplican y no se han evaluado en el semestre quedan marcados.

const RESULT_TONE: Readonly<
  Record<LegalResult, 'success' | 'warning' | 'destructive' | 'neutral'>
> = {
  complies: 'success',
  partial: 'warning',
  fails: 'destructive',
  not_applicable: 'neutral',
};

function LastEvaluation({ item }: { readonly item: LegalRequirement }): JSX.Element {
  const last = item.last_evaluation;
  return (
    <span className="flex flex-col items-start gap-1">
      {last === null ? (
        <span className="text-muted-foreground">Sin evaluar</span>
      ) : (
        <>
          <Badge tone={RESULT_TONE[last.result]}>{LEGAL_RESULTS[last.result]}</Badge>
          <span className="text-xs text-muted-foreground">
            {shownDate(last.evaluated_on)}
            {last.action === null ? '' : ` · acción ${last.action.code}`}
          </span>
        </>
      )}
      {item.pending ? <Badge tone="info">Por evaluar en el semestre</Badge> : null}
    </span>
  );
}

function RequirementRow({ item }: { readonly item: LegalRequirement }): JSX.Element {
  return (
    <TableRow>
      <TableCell>
        <strong>{item.code}</strong>
        {item.applies ? '' : ' (no aplica)'}
      </TableCell>
      <TableCell>
        {LEGAL_NORM_TYPES[item.norm_type]} · {item.norm}
        <span className="block text-xs text-muted-foreground">
          {item.issuer}
          {item.article === null ? '' : ` · ${item.article}`}
        </span>
      </TableCell>
      <TableCell>{item.requirement}</TableCell>
      <TableCell>{item.process?.name ?? '—'}</TableCell>
      <TableCell>
        <LastEvaluation item={item} />
      </TableCell>
      <TableCell>
        <span className="flex flex-wrap gap-1">
          <EvaluateForm item={item} />
          <RequirementForm item={item} />
          <EvaluationHistory item={item} />
        </span>
      </TableCell>
    </TableRow>
  );
}

function ExportNormograma(): JSX.Element {
  const api = useApiClient();
  const action = useHrAction<undefined, DownloadedFile>(
    (_input, csrfToken) =>
      api.download('/v1/qms/legal-requirements/export', { body: {}, csrfToken }),
    save,
  );
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={action.pending}
        onClick={() => {
          action.execute(undefined);
        }}
      >
        {action.pending ? 'Descargando…' : 'Descargar normograma (CSV)'}
      </Button>
      <div aria-live="polite">
        {action.result === undefined ? null : (
          <FormSuccess message={`Descargamos ${action.result.fileName}.`} />
        )}
      </div>
      {action.error === null ? null : <FormError error={action.error} />}
      {action.dialog}
    </div>
  );
}

const HEADERS = ['Código', 'Norma', 'Requisito', 'Proceso', 'Última evaluación', ''];

export function Normograma(): JSX.Element {
  const query = useDirectionQuery('/v1/qms/legal-requirements', legalRequirementListResponseSchema);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Normograma y evaluación de cumplimiento"
        description="Las normas que la empresa debe cumplir (RE-DG-001) y su evaluación de cada semestre."
      />
      <div className="flex flex-wrap items-start gap-2">
        <RequirementForm />
        <LegalImport />
        <ExportNormograma />
      </div>
      <QueryState query={query} loadingLabel="Cargando el normograma">
        {(data) => (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              Semestre en curso: {data.current_period}. Pendientes de evaluar:{' '}
              {data.data.filter((item) => item.pending).length}.
            </p>
            {data.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                El normograma está vacío. Registre los requisitos o cargue el archivo RE-DG-001.
              </p>
            ) : (
              <SimpleTable headers={HEADERS} scrollLabel="Normograma">
                {data.data.map((item) => (
                  <RequirementRow key={item.id} item={item} />
                ))}
              </SimpleTable>
            )}
          </div>
        )}
      </QueryState>
    </div>
  );
}
