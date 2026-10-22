'use client';

import {
  RETENTION_DISPOSITIONS,
  retentionDispositionSchema,
  type CreateRetentionRule,
  type RetentionDisposition,
  type RetentionRule,
} from '@arza/contracts';
import { DialogFooter, SelectField } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useCatalog, useOrgUnits } from '../organization/queries';
import { TextInput, idOrNull, optionsOf } from '../organization/record-dialog';
import { useSaveRetentionRule } from './retention-queries';

// Formulario de una regla de retención (B21, RE-SGC-005): la serie, a qué documentos se aplica
// (tipo, proceso o los dos), sus años en gestión y en el archivo central, qué pasa al vencer y su
// fundamento. El código no cambia después de crearla.

interface RuleValues {
  readonly code: string;
  readonly name: string;
  readonly docType: string;
  readonly processId: string;
  readonly activeYears: string;
  readonly archiveYears: string;
  readonly disposition: RetentionDisposition;
  readonly legalBasis: string;
}

const DISPOSITION_OPTIONS = Object.entries(RETENTION_DISPOSITIONS).map(([value, label]) => ({
  value,
  label,
}));

function valuesOf(rule: RetentionRule | null): RuleValues {
  return {
    code: rule?.code ?? '',
    name: rule?.name ?? '',
    docType: rule?.doc_type ?? '',
    processId: rule?.process?.id ?? '',
    activeYears: String(rule?.active_years ?? 2),
    archiveYears: String(rule?.archive_years ?? 8),
    disposition: rule?.disposition ?? 'destroy',
    legalBasis: rule?.legal_basis ?? '',
  };
}

function bodyOf(values: RuleValues): CreateRetentionRule {
  return {
    code: values.code.trim().toUpperCase(),
    name: values.name.trim(),
    doc_type: idOrNull(values.docType),
    process_id: idOrNull(values.processId),
    active_years: Number(values.activeYears),
    archive_years: Number(values.archiveYears),
    disposition: values.disposition,
    legal_basis: values.legalBasis.trim(),
  };
}

/** A qué documentos se aplica: el tipo, el proceso o los dos. */
function TargetFields(props: {
  readonly values: RuleValues;
  readonly onChange: (values: RuleValues) => void;
}): JSX.Element {
  const { values, onChange } = props;
  const types = (useCatalog('document_types').data?.items ?? []).filter((item) => item.is_active);
  const processes = (useOrgUnits().data?.data ?? []).filter((unit) => unit.kind === 'process');
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField
        id="regla-tipo"
        label="Tipo de documento"
        value={values.docType}
        options={optionsOf(
          types.map((item) => ({ id: item.code, label: `${item.code} · ${item.label}` })),
          'Cualquier tipo',
        )}
        onChange={(event) => {
          onChange({ ...values, docType: event.target.value });
        }}
      />
      <SelectField
        id="regla-proceso"
        label="Proceso"
        value={values.processId}
        options={optionsOf(
          processes.map((unit) => ({ id: unit.id, label: `${unit.code} · ${unit.name}` })),
          'Cualquier proceso',
        )}
        onChange={(event) => {
          onChange({ ...values, processId: event.target.value });
        }}
      />
    </div>
  );
}

function YearsInput(props: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onValue: (value: string) => void;
}): JSX.Element {
  return <TextInput {...props} type="number" min={0} max={100} />;
}

function YearsFields(props: {
  readonly values: RuleValues;
  readonly onChange: (values: RuleValues) => void;
}): JSX.Element {
  const { values, onChange } = props;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <YearsInput
        id="regla-gestion"
        label="Años en gestión"
        value={values.activeYears}
        onValue={(activeYears) => {
          onChange({ ...values, activeYears });
        }}
      />
      <YearsInput
        id="regla-central"
        label="Años en el archivo central"
        value={values.archiveYears}
        onValue={(archiveYears) => {
          onChange({ ...values, archiveYears });
        }}
      />
      <SelectField
        id="regla-disposicion"
        label="Al vencer"
        value={values.disposition}
        options={DISPOSITION_OPTIONS}
        onChange={(event) => {
          const parsed = retentionDispositionSchema.safeParse(event.target.value);
          if (parsed.success) onChange({ ...values, disposition: parsed.data });
        }}
      />
    </div>
  );
}

function SeriesFields(props: {
  readonly values: RuleValues;
  readonly onChange: (values: RuleValues) => void;
  readonly isNew: boolean;
}): JSX.Element {
  const { values, onChange } = props;
  return (
    <>
      {props.isNew ? (
        <TextInput
          id="regla-codigo"
          label="Código de la serie"
          hint="Como aparece en el RE-SGC-005, por ejemplo CON-01. No cambia después."
          value={values.code}
          onValue={(code) => {
            onChange({ ...values, code });
          }}
        />
      ) : null}
      <TextInput
        id="regla-nombre"
        label="Serie documental"
        value={values.name}
        onValue={(name) => {
          onChange({ ...values, name });
        }}
      />
    </>
  );
}

export function RuleForm(props: {
  readonly rule: RetentionRule | null;
  readonly onSaved: () => void;
}): JSX.Element {
  const [values, setValues] = useState<RuleValues>(valuesOf(props.rule));
  const save = useSaveRetentionRule(props.rule, props.onSaved);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    save.execute(bodyOf(values));
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {save.error === null ? null : <FormError error={save.error} />}
      <SeriesFields values={values} onChange={setValues} isNew={props.rule === null} />
      <TargetFields values={values} onChange={setValues} />
      <YearsFields values={values} onChange={setValues} />
      <TextInput
        id="regla-fundamento"
        label="Fundamento"
        hint="La norma o el documento del SGC que fija el plazo."
        value={values.legalBasis}
        onValue={(legalBasis) => {
          setValues({ ...values, legalBasis });
        }}
      />
      <DialogFooter>
        <SubmitButton label="Guardar" pendingLabel="Guardando…" pending={save.pending} />
      </DialogFooter>
      {save.dialog}
    </form>
  );
}
