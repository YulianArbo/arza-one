'use client';

import type { JSX } from 'react';

import { TextInput } from '../organization/record-dialog';
import { keyFrom, keysBut, newField, type DesignField, type DesignSection } from './design-model';
import { FieldEditor } from './field-editor';
import { SmallButton } from './small-button';

// Una sección en el diseñador de formatos (B20): su título y sus campos, en orden.

function moved<T>(list: readonly T[], index: number, offset: -1 | 1): T[] {
  const target = index + offset;
  if (target < 0 || target >= list.length) return [...list];
  const copy = [...list];
  const [item] = copy.splice(index, 1);
  if (item !== undefined) copy.splice(target, 0, item);
  return copy;
}

interface SectionEditorProps {
  readonly sections: readonly DesignSection[];
  readonly section: DesignSection;
  readonly position: string;
  readonly onSave: (section: DesignSection) => void;
  readonly onRemove: () => void;
}

function Fields(props: SectionEditorProps): JSX.Element {
  const { sections, section, onSave } = props;
  const replace = (uid: string, next: DesignField) => {
    onSave({ ...section, fields: section.fields.map((f) => (f.uid === uid ? next : f)) });
  };
  return (
    <>
      {section.fields.map((field, at) => (
        <FieldEditor
          key={field.uid}
          field={field}
          position={`${props.position}.${String(at + 1)}`}
          onChange={(next) => {
            replace(field.uid, next);
          }}
          onLabel={(label) => {
            const key = field.fresh ? keyFrom(label, keysBut(sections, field.uid)) : field.key;
            replace(field.uid, { ...field, label, key });
          }}
          onMove={(offset) => {
            onSave({ ...section, fields: moved(section.fields, at, offset) });
          }}
          onRemove={() => {
            onSave({ ...section, fields: section.fields.filter((f) => f.uid !== field.uid) });
          }}
        />
      ))}
    </>
  );
}

export function SectionEditor(props: SectionEditorProps): JSX.Element {
  const { sections, section, position, onSave } = props;
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-semibold">Sección {position}</legend>
      <TextInput
        id={`seccion-${section.uid}`}
        label={`Título de la sección ${position}`}
        value={section.title}
        maxLength={120}
        onValue={(title) => {
          onSave({ ...section, title });
        }}
      />
      <Fields {...props} />
      <div className="flex flex-wrap gap-2">
        <SmallButton
          label={`Agregar campo a la sección ${position}`}
          onClick={() => {
            onSave({ ...section, fields: [...section.fields, newField(keysBut(sections, ''))] });
          }}
        />
        <SmallButton label={`Quitar la sección ${position}`} onClick={props.onRemove} />
      </div>
    </fieldset>
  );
}
