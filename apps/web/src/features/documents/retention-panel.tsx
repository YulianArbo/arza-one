'use client';

import {
  RETENTION_DISPOSITIONS,
  type Document,
  type DocumentRetention,
  type RetentionRule,
} from '@arza/contracts';
import { DialogFooter } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { formatDate } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { SelectField } from '../administration/select-field';
import { RecordDialog, idOrNull, optionsOf } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { retentionYears } from './labels';
import { useDocumentRetention, useRetentionRules, useSetDocumentRule } from './retention-queries';

// Retención de un documento (B21, RE-SGC-005): su regla, desde cuándo corre el plazo y cuándo
// vence. Calidad puede darle otra regla como excepción a la de su tipo y su proceso.

function since(retention: DocumentRetention): string {
  if (retention.base_on === null) {
    return 'Todavía no corre: corre desde que un documento del SGC queda obsoleto, o desde la publicación de uno de expediente.';
  }
  return formatDate(retention.base_on);
}

function Facts({ retention }: { readonly retention: DocumentRetention }): JSX.Element {
  const { rule } = retention;
  const facts: readonly (readonly [string, string])[] = [
    [
      'Regla',
      rule === null
        ? 'Sin regla: asígnele una o cree la de su tipo en la tabla de retención'
        : `${rule.code} · ${rule.name}${retention.explicit ? ' (excepción de este documento)' : ''}`,
    ],
    ['Conservación', rule === null ? '—' : retentionYears(rule.active_years, rule.archive_years)],
    ['Al vencer', rule === null ? '—' : RETENTION_DISPOSITIONS[rule.disposition]],
    ['El plazo corre desde', since(retention)],
    ['Vence', retention.due_on === null ? '—' : formatDate(retention.due_on)],
  ];
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-3">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RuleForm(props: {
  readonly documentId: string;
  readonly retention: DocumentRetention;
  readonly rules: readonly RetentionRule[];
  readonly onSaved: () => void;
}): JSX.Element {
  const { retention } = props;
  const [ruleId, setRuleId] = useState(retention.explicit ? (retention.rule?.id ?? '') : '');
  const save = useSetDocumentRule(props.documentId, props.onSaved);
  const options = props.rules
    .filter((rule) => rule.is_active)
    .map((rule) => ({ id: rule.id, label: `${rule.code} · ${rule.name}` }));
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    save.execute({ ruleId: idOrNull(ruleId), version: retention.version });
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {save.error === null ? null : <FormError error={save.error} />}
      <SelectField
        id="documento-regla"
        label="Regla de retención"
        hint="Sin excepción, el documento toma la regla de su tipo y su proceso."
        value={ruleId}
        options={optionsOf(options, 'Sin excepción: la de su tipo y su proceso')}
        onChange={(event) => {
          setRuleId(event.target.value);
        }}
      />
      <DialogFooter>
        <SubmitButton label="Guardar" pendingLabel="Guardando…" pending={save.pending} />
      </DialogFooter>
      {save.dialog}
    </form>
  );
}

function ChangeRule(props: {
  readonly documentId: string;
  readonly retention: DocumentRetention;
}): JSX.Element | null {
  const rules = useRetentionRules();
  const data = rules.data?.data;
  if (data === undefined) return null;
  return (
    <RecordDialog
      triggerLabel="Cambiar la regla"
      variant="outline"
      title="Regla de retención del documento"
      description="Una excepción a la regla de su tipo y su proceso. Queda en la auditoría."
    >
      {(close) => (
        <RuleForm
          documentId={props.documentId}
          retention={props.retention}
          rules={data}
          onSaved={close}
        />
      )}
    </RecordDialog>
  );
}

export function RetentionPanel({ document }: { readonly document: Document }): JSX.Element {
  const disposed = document.status === 'disposed';
  const retention = useDocumentRetention(document.id);
  const canManage = usePermissions().can('doc.retention.manage');
  return (
    <QueryState query={retention} loadingLabel="Cargando la retención">
      {(data) => (
        <div className="flex flex-col gap-4">
          <Facts retention={data} />
          {data.expired && !disposed ? (
            <p role="status" className="text-sm">
              La retención venció. Si su regla dice eliminar, entra en la próxima propuesta de
              disposición final; nada se elimina sin aprobación.
            </p>
          ) : null}
          {canManage && !disposed ? (
            <div>
              <ChangeRule documentId={document.id} retention={data} />
            </div>
          ) : null}
        </div>
      )}
    </QueryState>
  );
}
