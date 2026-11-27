'use client';

import { aiUseCaseListResponseSchema, type AiUseCaseSetting } from '@arza/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  FormField,
  PageHeader,
  SimpleTable,
  TableCell,
  TableRow,
} from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { useAssistantAction, useAssistantQuery } from './assistant-queries';
import { USE_CASE_LABELS } from './labels';
import { shownDate } from '../direction/direction-queries';

// Usos activos del asistente (B47, decisión 7): el Oficial de datos activa cada uso después de
// aprobar su evaluación de impacto y la registra aquí. Apagar un uso no pide nada más.

interface Change {
  readonly setting: AiUseCaseSetting;
  readonly enabled: boolean;
  readonly reference: string | null;
  readonly approvedOn: string | null;
}

function useSaveUseCase() {
  const api = useApiClient();
  return useAssistantAction(async (change: Change, csrfToken) => {
    await api.put(`/v1/ai/use-cases/${change.setting.use_case}`, {
      body: {
        enabled: change.enabled,
        assessment_reference: change.reference,
        assessment_approved_on: change.approvedOn,
        version: change.setting.version,
      },
      csrfToken,
    });
  }, 'Los cambios quedaron guardados.');
}

interface EnableProps {
  readonly setting: AiUseCaseSetting;
  readonly onSave: (change: Change) => void;
}

/** Activar pide la evaluación de impacto aprobada y su fecha (decisión 7). */
function useEnableForm(props: EnableProps) {
  const [reference, setReference] = useState(props.setting.assessment_reference ?? '');
  const [approvedOn, setApprovedOn] = useState(props.setting.assessment_approved_on ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (reference.trim().length < 3 || approvedOn === '') {
      setProblem('Escriba la evaluación de impacto aprobada y su fecha.');
      return;
    }
    props.onSave({
      setting: props.setting,
      enabled: true,
      reference: reference.trim(),
      approvedOn,
    });
  };
  return { reference, setReference, approvedOn, setApprovedOn, problem, submit };
}

function EnableForm(props: EnableProps): JSX.Element {
  const form = useEnableForm(props);
  const id = `uso-${props.setting.use_case}`;
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={form.submit} noValidate>
      <FormField
        id={`${id}-evaluacion`}
        label="Evaluación de impacto"
        value={form.reference}
        error={form.problem}
        onChange={(event) => {
          form.setReference(event.target.value);
        }}
      />
      <FormField
        id={`${id}-fecha`}
        label="Aprobada el"
        type="date"
        value={form.approvedOn}
        onChange={(event) => {
          form.setApprovedOn(event.target.value);
        }}
      />
      <Button type="submit" variant="outline">
        Activar
      </Button>
    </form>
  );
}

function UseCaseRow(props: {
  readonly setting: AiUseCaseSetting;
  readonly onSave: (change: Change) => void;
}): JSX.Element {
  const { setting } = props;
  const turnOff = (): void => {
    props.onSave({ setting, enabled: false, reference: null, approvedOn: null });
  };
  return (
    <TableRow>
      <TableCell>{USE_CASE_LABELS[setting.use_case]}</TableCell>
      <TableCell>
        <Badge tone={setting.enabled ? 'success' : 'neutral'}>
          {setting.enabled ? 'Activo' : 'Apagado'}
        </Badge>
      </TableCell>
      <TableCell>
        {setting.assessment_reference === null
          ? '—'
          : `${setting.assessment_reference} (${shownDate(setting.assessment_approved_on)})`}
      </TableCell>
      <TableCell>
        {setting.enabled ? (
          <Button variant="outline" onClick={turnOff}>
            Apagar
          </Button>
        ) : (
          <EnableForm setting={setting} onSave={props.onSave} />
        )}
      </TableCell>
    </TableRow>
  );
}

export function UseCasesPage(): JSX.Element {
  const list = useAssistantQuery('/v1/ai/use-cases', aiUseCaseListResponseSchema);
  const save = useSaveUseCase();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Usos activos del asistente"
        description="Active cada uso solo después de aprobar su evaluación de impacto (Circular Externa 002 de 2024 de la SIC)."
      />
      {save.error === null ? null : <FormError error={save.error} />}
      <QueryState query={list} loadingLabel="Cargando los usos">
        {(data) => (
          <Card>
            <CardContent className="pt-6">
              <SimpleTable headers={['Uso', 'Estado', 'Evaluación de impacto', '']}>
                {data.data.map((setting) => (
                  <UseCaseRow key={setting.use_case} setting={setting} onSave={save.execute} />
                ))}
              </SimpleTable>
            </CardContent>
          </Card>
        )}
      </QueryState>
      {save.dialog}
    </div>
  );
}
