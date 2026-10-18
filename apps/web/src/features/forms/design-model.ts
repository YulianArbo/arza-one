import {
  formCodeSchema,
  formDefinitionSchema,
  RESERVED_FIELD_KEYS,
  type FormDefinition,
  type FormField,
  type FormFieldType,
  type TableColumnType,
} from '@arza/contracts';

// Modelo del diseñador de formatos (B20): las secciones y los campos como se editan en pantalla
// (opciones y puntos una por línea, nombres internos sugeridos a partir de la etiqueta) y su paso
// al esquema versionado que guarda la API.

export interface DesignColumn {
  readonly label: string;
  readonly type: TableColumnType;
}

export interface DesignField {
  readonly uid: string;
  /** Nombre interno; en un campo nuevo sigue a la etiqueta, en uno guardado no cambia. */
  readonly key: string;
  readonly fresh: boolean;
  readonly label: string;
  readonly type: FormFieldType;
  readonly required: boolean;
  readonly help: string;
  /** Opciones de una lista o puntos de una verificación, una por línea. */
  readonly lines: string;
  readonly columns: readonly DesignColumn[];
}

export interface DesignSection {
  readonly uid: string;
  readonly title: string;
  readonly fields: readonly DesignField[];
}

let counter = 0;

function newUid(): string {
  counter += 1;
  return `d${String(counter)}`;
}

/** «Fecha de la reunión» → fecha_de_la_reunion; nunca vacío ni reservado. */
export function keyFrom(label: string, taken: ReadonlySet<string>): string {
  const base =
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '_')
      .replace(/^_+|_+$/gu, '')
      .replace(/^(\d)/u, 'c_$1')
      .slice(0, 36) || 'campo';
  const safe = RESERVED_FIELD_KEYS.includes(base) ? `${base}_1` : base;
  let key = safe;
  for (let n = 2; taken.has(key); n += 1) key = `${safe}_${String(n)}`;
  return key;
}

export function newField(taken: ReadonlySet<string>): DesignField {
  return {
    uid: newUid(),
    key: keyFrom('campo', taken),
    fresh: true,
    label: '',
    type: 'text',
    required: false,
    help: '',
    lines: '',
    columns: [],
  };
}

/** Nombres internos de todos los campos menos uno, para no repetirlos. */
export function keysBut(sections: readonly DesignSection[], uid: string): Set<string> {
  return new Set(sections.flatMap((s) => s.fields.filter((f) => f.uid !== uid).map((f) => f.key)));
}

export function newSection(): DesignSection {
  return { uid: newUid(), title: '', fields: [] };
}

function linesOf(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function fieldOf(field: DesignField, columnKeys: Set<string>): FormField {
  const lines = linesOf(field.lines);
  return {
    key: field.key,
    label: field.label.trim(),
    type: field.type,
    required: field.required,
    help: field.help.trim() === '' ? null : field.help.trim(),
    options: field.type === 'select' ? lines : [],
    items: field.type === 'checklist' ? lines : [],
    columns:
      field.type === 'table'
        ? field.columns.map((column) => {
            const key = keyFrom(column.label, columnKeys);
            columnKeys.add(key);
            return { key, label: column.label.trim(), type: column.type };
          })
        : [],
  };
}

export function definitionOf(sections: readonly DesignSection[]): FormDefinition {
  const sectionKeys = new Set<string>();
  return {
    sections: sections.map((section) => {
      const key = keyFrom(section.title, sectionKeys);
      sectionKeys.add(key);
      return {
        key,
        title: section.title.trim(),
        fields: section.fields.map((f) => fieldOf(f, new Set())),
      };
    }),
  };
}

export function sectionsOf(definition: FormDefinition): DesignSection[] {
  return definition.sections.map((section) => ({
    uid: newUid(),
    title: section.title,
    fields: section.fields.map((field) => ({
      uid: newUid(),
      key: field.key,
      fresh: false,
      label: field.label,
      type: field.type,
      required: field.required,
      help: field.help ?? '',
      lines: (field.type === 'select' ? field.options : field.items).join('\n'),
      columns: field.columns.map((column) => ({ label: column.label, type: column.type })),
    })),
  }));
}

/** Los problemas del diseño, en palabras de la persona. */
export function designProblems(input: {
  readonly code: string | null;
  readonly name: string;
  readonly sections: readonly DesignSection[];
}): string[] {
  const problems: string[] = [];
  if (input.code !== null && !formCodeSchema.safeParse(input.code).success) {
    problems.push('Escriba el código del Listado Maestro, como FT-COM-002.');
  }
  const name = input.name.trim().length;
  if (name < 3 || name > 200) problems.push('Escriba el nombre del formato (3 a 200 caracteres).');
  const parsed = formDefinitionSchema.safeParse(definitionOf(input.sections));
  if (!parsed.success) {
    for (const issue of parsed.error.issues)
      problems.push(describe(issue.path, issue.message, input.sections));
  }
  return [...new Set(problems)];
}

function describe(
  path: readonly PropertyKey[],
  message: string,
  sections: readonly DesignSection[],
): string {
  const [, sectionIndex, , fieldIndex, part] = path;
  const section = typeof sectionIndex === 'number' ? sections[sectionIndex] : undefined;
  const field = typeof fieldIndex === 'number' ? section?.fields[fieldIndex] : undefined;
  const where = [
    section === undefined ? null : `Sección «${section.title || String(Number(sectionIndex) + 1)}»`,
    field === undefined ? null : `campo «${field.label || String(Number(fieldIndex) + 1)}»`,
  ]
    .filter(Boolean)
    .join(', ');
  if (path.length === 1 || where === '') return 'Agregue al menos una sección con un campo.';
  const detail = part === 'label' || part === 'title' ? 'escriba su nombre.' : message;
  return `${where}: ${detail}`;
}
