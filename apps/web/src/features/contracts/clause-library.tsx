'use client';

import { CONTRACT_VARIABLES, createClauseRequestSchema, type Clause } from '@arza/contracts';
import {
  Badge,
  Card,
  CardContent,
  Checkbox,
  DialogFooter,
  FormField,
  Label,
  TextareaField,
} from '@arza/ui';
import Link from 'next/link';
import { useState, type JSX, type SubmitEvent } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { RecordDialog } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { CONTRACT_PATHS } from './labels';
import { useClauses, useContractAction } from './queries';

// Biblioteca de cláusulas aprobadas (B24, ficha 17.7). Todos los que ven contratos la consultan;
// solo la Dirección agrega una cláusula o crea la versión siguiente de una existente. Los textos
// iniciales están «por validar por el asesor jurídico» (numeral 19.4).

interface ClauseValues {
  readonly key: string;
  readonly title: string;
  readonly body: string;
  readonly numbered: boolean;
  readonly validated: boolean;
}

const VARIABLE_LIST = Object.entries(CONTRACT_VARIABLES)
  .map(([name, label]) => `{{${name}}}: ${label}`)
  .join(' · ');

function initialClause(clause: Clause | null): ClauseValues {
  return {
    key: clause?.key ?? '',
    title: clause?.title ?? '',
    body: clause?.body ?? '',
    numbered: clause?.numbered ?? true,
    validated: clause?.legal_validated ?? false,
  };
}

function useClauseForm(clause: Clause | null, onDone: () => void) {
  const api = useApiClient();
  const [values, setValues] = useState(() => initialClause(clause));
  const [problem, setProblem] = useState<string | null>(null);
  const store = useContractAction<object>(async (body, csrfToken) => {
    const path =
      clause === null ? '/v1/contract-clauses' : `/v1/contract-clauses/${clause.key}/versions`;
    await api.post(path, { body, csrfToken });
  }, onDone);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const body = {
      title: values.title.trim(),
      body: values.body.trim(),
      numbered: values.numbered,
      legal_validated: values.validated,
    };
    const full = { key: clause?.key ?? values.key.trim(), ...body };
    const result = createClauseRequestSchema.safeParse(full);
    setProblem(result.success ? null : (result.error.issues[0]?.message ?? 'Revise los datos.'));
    if (result.success) store.execute(clause === null ? full : body);
  };
  return { values, setValues, problem, store, submit };
}

function Toggle(props: {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly onToggle: () => void;
}): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={props.id} checked={props.checked} onChange={props.onToggle} />
      <Label htmlFor={props.id}>{props.label}</Label>
    </div>
  );
}

function ClauseToggles(props: {
  readonly values: ClauseValues;
  readonly onChange: (values: ClauseValues) => void;
}): JSX.Element {
  const { values, onChange } = props;
  return (
    <>
      <Toggle
        id="clausula-numerada"
        label="Lleva número (PRIMERA, SEGUNDA…)"
        checked={values.numbered}
        onToggle={() => {
          onChange({ ...values, numbered: !values.numbered });
        }}
      />
      <Toggle
        id="clausula-validada"
        label="El asesor jurídico ya validó este texto"
        checked={values.validated}
        onToggle={() => {
          onChange({ ...values, validated: !values.validated });
        }}
      />
    </>
  );
}

function ClauseFields(props: {
  readonly isNew: boolean;
  readonly values: ClauseValues;
  readonly onChange: (values: ClauseValues) => void;
}): JSX.Element {
  const { values, onChange } = props;
  const text = (key: 'key' | 'title', id: string, label: string, hint?: string) => (
    <FormField
      id={id}
      label={label}
      {...(hint === undefined ? {} : { hint })}
      value={values[key]}
      onChange={(event) => {
        onChange({ ...values, [key]: event.target.value });
      }}
    />
  );
  return (
    <>
      {props.isNew
        ? text('key', 'clausula-clave', 'Clave', 'Minúsculas y guiones: clausula-penal')
        : null}
      {text('title', 'clausula-titulo', 'Título')}
      <TextareaField
        id="clausula-texto"
        label="Texto"
        hint={`Variables: ${VARIABLE_LIST}`}
        rows={8}
        value={values.body}
        onChange={(event) => {
          onChange({ ...values, body: event.target.value });
        }}
      />
      <ClauseToggles values={values} onChange={onChange} />
    </>
  );
}

function ClauseForm(props: {
  readonly clause: Clause | null;
  readonly onDone: () => void;
}): JSX.Element {
  const form = useClauseForm(props.clause, props.onDone);
  return (
    <form noValidate onSubmit={form.submit} className="flex flex-col gap-4">
      {form.store.error === null ? null : <FormError error={form.store.error} />}
      {form.problem === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {form.problem}
        </p>
      )}
      <ClauseFields isNew={props.clause === null} values={form.values} onChange={form.setValues} />
      <DialogFooter>
        <SubmitButton
          label="Aprobar y guardar"
          pendingLabel="Guardando…"
          pending={form.store.pending}
        />
      </DialogFooter>
      {form.store.dialog}
    </form>
  );
}

function ClauseCard(props: { readonly clause: Clause; readonly canManage: boolean }): JSX.Element {
  const { clause } = props;
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{clause.title}</span>
          <Badge tone="neutral">Versión {clause.version}</Badge>
          <Badge tone={clause.legal_validated ? 'success' : 'warning'}>
            {clause.legal_validated
              ? 'Validada por el asesor jurídico'
              : 'Por validar por el asesor jurídico'}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {clause.key} ·{' '}
          {clause.templates.length === 0 ? 'Sin plantilla' : clause.templates.join(', ')} · aprobada{' '}
          {clause.approved_by === null ? 'con la semilla' : `por ${clause.approved_by.name}`} el{' '}
          {formatDateTime(clause.approved_at)}
        </p>
        <p className="whitespace-pre-line text-sm">{clause.body}</p>
        {props.canManage ? (
          <div>
            <RecordDialog
              triggerLabel="Crear versión nueva"
              variant="outline"
              title={`Nueva versión de «${clause.title}»`}
              description="La versión anterior se conserva para los contratos que ya la usaron."
            >
              {(close) => <ClauseForm clause={clause} onDone={close} />}
            </RecordDialog>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ClauseLibrary(): JSX.Element {
  const { can } = usePermissions();
  const clauses = useClauses();
  const canManage = can('contract.clause.manage');
  return (
    <div className="flex flex-col gap-4">
      <Link
        href={CONTRACT_PATHS.list}
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        ← Volver a los contratos
      </Link>
      <PageHeader
        title="Biblioteca de cláusulas"
        description="Las cláusulas aprobadas con que se arman las plantillas CT-COM y OS-COM."
        action={
          canManage ? (
            <RecordDialog
              triggerLabel="Agregar una cláusula"
              title="Nueva cláusula"
              description="Queda aprobada por usted. Use solo las variables de la lista."
            >
              {(close) => <ClauseForm clause={null} onDone={close} />}
            </RecordDialog>
          ) : null
        }
      />
      <QueryState query={clauses} loadingLabel="Cargando la biblioteca">
        {(data) => (
          <div className="flex flex-col gap-3">
            {data.data.map((clause) => (
              <ClauseCard key={clause.key} clause={clause} canManage={canManage} />
            ))}
          </div>
        )}
      </QueryState>
    </div>
  );
}
