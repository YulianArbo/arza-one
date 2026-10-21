'use client';

import { RETENTION_DISPOSITIONS, type RetentionRule } from '@arza/contracts';
import { Badge, EmptyState, TableCell, TableRow } from '@arza/ui';
import { Archive } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { PageHeader } from '../../components/app-shell/page-header';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { SimpleTable } from '../administration/simple-table';
import { ActiveBadge, RecordDialog } from '../organization/record-dialog';
import { DISPOSITIONS_PATH, documentPath, retentionYears } from './labels';
import {
  useRetentionRules,
  useToggleRetentionRule,
  useUnassignedDocuments,
} from './retention-queries';
import { RuleForm } from './retention-rule-form';

// Tabla de retención (B21, RE-SGC-005): cada serie con sus años en el archivo de gestión y en el
// central, su disposición final y cuántos documentos toma. Los documentos sin regla deben quedar
// en cero (capítulo 18.2, paso 4).

function target(rule: RetentionRule): string {
  const parts = [
    rule.doc_type === null ? null : `${rule.doc_type} · ${rule.doc_type_label ?? ''}`,
    rule.process === null ? null : rule.process.name,
  ].filter((part) => part !== null);
  return parts.join(' del proceso ');
}

function RuleActions(props: {
  readonly rule: RetentionRule;
  readonly onToggle: (rule: RetentionRule) => void;
}): JSX.Element {
  const { rule } = props;
  const toggle = rule.is_active ? 'Desactivar' : 'Activar';
  return (
    <>
      <RecordDialog
        triggerLabel="Editar"
        triggerAriaLabel={`Editar ${rule.code}`}
        variant="outline"
        title={`Editar ${rule.code} · ${rule.name}`}
        description="El código no cambia. Los cambios quedan en la auditoría."
      >
        {(close) => <RuleForm rule={rule} onSaved={close} />}
      </RecordDialog>
      <ConfirmActionButton
        label={toggle}
        title={`¿${toggle} la regla ${rule.code}?`}
        description={
          rule.is_active
            ? 'Sus documentos tomarán otra regla de su tipo o su proceso, si existe.'
            : 'Vuelve a aplicarse a los documentos de su tipo y su proceso.'
        }
        confirmLabel={`Sí, ${toggle.toLowerCase()}`}
        disabled={false}
        onConfirm={() => {
          props.onToggle(rule);
        }}
      />
    </>
  );
}

function RuleRow(props: {
  readonly rule: RetentionRule;
  readonly onToggle: (rule: RetentionRule) => void;
}): JSX.Element {
  const { rule } = props;
  return (
    <TableRow>
      <TableCell className="font-medium">{rule.code}</TableCell>
      <TableCell>
        <p>{rule.name}</p>
        <p className="text-xs text-muted-foreground">{target(rule)}</p>
      </TableCell>
      <TableCell>{retentionYears(rule.active_years, rule.archive_years)}</TableCell>
      <TableCell>
        <Badge tone={rule.disposition === 'destroy' ? 'warning' : 'info'}>
          {RETENTION_DISPOSITIONS[rule.disposition]}
        </Badge>
      </TableCell>
      <TableCell>{rule.documents}</TableCell>
      <TableCell>
        <ActiveBadge active={rule.is_active} />
      </TableCell>
      <TableCell className="flex gap-2">
        <RuleActions rule={rule} onToggle={props.onToggle} />
      </TableCell>
    </TableRow>
  );
}

function Rules(props: {
  readonly rules: readonly RetentionRule[];
  readonly onToggle: (rule: RetentionRule) => void;
}): JSX.Element {
  if (props.rules.length === 0) {
    return (
      <EmptyState
        icon={<Archive />}
        title="Todavía no hay reglas de retención"
        description="Agregue las series del RE-SGC-005, o cárguelas todas con el comando pnpm doc:importar-retencion."
      />
    );
  }
  return (
    <SimpleTable
      headers={[
        'Código',
        'Serie y a qué se aplica',
        'Conservación',
        'Al vencer',
        'Documentos',
        'Estado',
        '',
      ]}
    >
      {props.rules.map((rule) => (
        <RuleRow key={rule.id} rule={rule} onToggle={props.onToggle} />
      ))}
    </SimpleTable>
  );
}

/** Los documentos que aún no tienen regla, para corregirlos (evidencia del capítulo 18.2). */
function Unassigned({ total }: { readonly total: number }): JSX.Element {
  const list = useUnassignedDocuments();
  if (total === 0) {
    return (
      <p className="text-sm" role="status">
        Todos los documentos tienen su regla de retención.
      </p>
    );
  }
  return (
    <details className="rounded-md border p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        {total === 1 ? 'Un documento no tiene' : `${String(total)} documentos no tienen`} regla de
        retención
      </summary>
      <QueryState query={list} loadingLabel="Cargando los documentos sin regla">
        {(data) => (
          <ul className="mt-2 flex flex-col gap-1">
            {data.data.map((row) => (
              <li key={row.id}>
                <Link href={documentPath(row.id)} className="text-primary hover:underline">
                  {row.code}
                </Link>{' '}
                · {row.title}
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </details>
  );
}

export function RetentionRules(): JSX.Element {
  const rules = useRetentionRules();
  const toggle = useToggleRetentionRule();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tabla de retención"
        description="RE-SGC-005: cuánto tiempo se conserva cada serie de documentos y qué pasa al vencer. Cada documento toma la regla de su tipo y su proceso; la más específica gana."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={DISPOSITIONS_PATH} className="text-sm text-primary hover:underline">
              Ver la disposición final
            </Link>
            <RecordDialog
              triggerLabel="Agregar una regla"
              title="Agregar una regla de retención"
              description="Elija el tipo de documento, el proceso o los dos."
            >
              {(close) => <RuleForm rule={null} onSaved={close} />}
            </RecordDialog>
          </div>
        }
      />
      {toggle.error === null ? null : <FormError error={toggle.error} />}
      {toggle.dialog}
      <QueryState query={rules} loadingLabel="Cargando la tabla de retención">
        {(data) => (
          <div className="flex flex-col gap-4">
            <Unassigned total={data.unassigned_documents} />
            <Rules rules={data.data} onToggle={toggle.execute} />
          </div>
        )}
      </QueryState>
    </div>
  );
}
