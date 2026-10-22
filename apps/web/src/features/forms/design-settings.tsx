'use client';

import { SelectField } from '@arza/ui';
import { FORM_ENTITY_TYPES, FORM_FLOWS, type FormTemplate } from '@arza/contracts';
import type { JSX } from 'react';

import { TextInput } from '../organization/record-dialog';
import { useOutputTemplates } from './queries';

// Datos generales del formato en el diseñador (B20): código, nombre, quién aprueba sus registros,
// a qué registro se une, su clasificación y la plantilla de salida de su PDF.

export interface DesignSettings {
  readonly code: string;
  readonly name: string;
  readonly workflowKey: string;
  readonly classification: string;
  readonly entityType: string;
  readonly outputTemplateId: string;
}

const FLOW_OPTIONS = [
  { value: '', label: 'Sin aprobación: termina al enviarlo' },
  ...Object.entries(FORM_FLOWS).map(([value, label]) => ({ value, label })),
];
const ENTITY_OPTIONS = [
  { value: '', label: 'Ninguno: se diligencia suelto' },
  { value: 'doc_version', label: FORM_ENTITY_TYPES.doc_version },
  { value: 'party', label: FORM_ENTITY_TYPES.party },
];
const CLASSIFICATION_OPTIONS = [
  { value: 'internal', label: 'Interno' },
  { value: 'confidential', label: 'Confidencial (quien lo diligencia, quien aprueba y terceros)' },
];

interface SettingsProps {
  readonly settings: DesignSettings;
  /** El formato que se edita; null si es nuevo. */
  readonly template: FormTemplate | null;
  readonly onChange: (settings: DesignSettings) => void;
}

function Approval({ settings, onChange }: SettingsProps): JSX.Element {
  return (
    <>
      <SelectField
        id="formato-flujo"
        label="Aprobación de los registros"
        value={settings.workflowKey}
        options={FLOW_OPTIONS}
        onChange={(event) => {
          onChange({ ...settings, workflowKey: event.target.value });
        }}
      />
      <SelectField
        id="formato-registro"
        label="Se une a"
        value={settings.entityType}
        options={ENTITY_OPTIONS}
        onChange={(event) => {
          onChange({ ...settings, entityType: event.target.value });
        }}
      />
    </>
  );
}

function Output({ settings, onChange }: SettingsProps): JSX.Element {
  const outputs = (useOutputTemplates().data?.data ?? []).filter((t) => t.status === 'published');
  const options = outputs.map((t) => ({ value: t.id, label: `${t.code} · ${t.name}` }));
  return (
    <SelectField
      id="formato-plantilla"
      label="Plantilla de salida del PDF"
      hint="Sin plantilla, el PDF usa la maqueta institucional del formato."
      value={settings.outputTemplateId}
      options={[{ value: '', label: 'Maqueta institucional' }, ...options]}
      onChange={(event) => {
        onChange({ ...settings, outputTemplateId: event.target.value });
      }}
    />
  );
}

export function SettingsFields(props: SettingsProps): JSX.Element {
  const { settings, onChange, template } = props;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextInput
        id="formato-codigo"
        label="Código"
        hint="El del Listado Maestro, como FT-COM-002."
        value={settings.code}
        disabled={template !== null}
        onValue={(code) => {
          onChange({ ...settings, code: code.toUpperCase() });
        }}
      />
      <TextInput
        id="formato-nombre"
        label="Nombre"
        value={settings.name}
        maxLength={200}
        onValue={(name) => {
          onChange({ ...settings, name });
        }}
      />
      {template?.fill_mode === 'system' ? null : <Approval {...props} />}
      <SelectField
        id="formato-clasificacion"
        label="Clasificación"
        value={settings.classification}
        options={CLASSIFICATION_OPTIONS}
        onChange={(event) => {
          onChange({ ...settings, classification: event.target.value });
        }}
      />
      <Output {...props} />
    </div>
  );
}
