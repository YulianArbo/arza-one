import {
  CHECK_RESULTS,
  formFields,
  type ChecklistAnswer,
  type FormData,
  type FormDefinition,
  type FormField,
  type FormValue,
  type TableColumn,
  type TableRow,
} from '@arza/contracts';

// Valores de un registro diligenciado como se imprimen (B20): fechas dd/mm/aaaa, sí o no, la
// respuesta de cada punto de una verificación y las filas de una tabla. Los usan la maqueta del
// formato y las variables de las plantillas de salida.

export interface ChecklistLine {
  readonly punto: string;
  readonly resultado: string;
  readonly observacion: string;
}

export type PrintedRow = Readonly<Record<string, string>>;

/** Valor impreso: texto, o las filas de una verificación o de una tabla. */
export type PrintedValue = string | readonly ChecklistLine[] | readonly PrintedRow[];

/** 2026-10-18 → 18/10/2026. */
export function printedDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return year === undefined || month === undefined || day === undefined
    ? isoDate
    : `${day}/${month}/${year}`;
}

function cellText(column: TableColumn, value: string | undefined): string {
  if (value === undefined || value === '') return '';
  return column.type === 'date' ? printedDate(value) : value;
}

function checklistLines(field: FormField, value: FormValue | undefined): ChecklistLine[] {
  const answers = Array.isArray(value) ? (value as readonly ChecklistAnswer[]) : [];
  return field.items.map((item, index) => {
    const answer = answers[index];
    return {
      punto: item,
      resultado:
        answer?.result === null || answer === undefined ? '' : CHECK_RESULTS[answer.result],
      observacion: answer?.note ?? '',
    };
  });
}

function tableRows(field: FormField, value: FormValue | undefined): PrintedRow[] {
  const rows = Array.isArray(value) ? (value as readonly TableRow[]) : [];
  return rows.map((row) =>
    Object.fromEntries(
      field.columns.map((column) => [column.key, cellText(column, row[column.key])]),
    ),
  );
}

export function printedValue(field: FormField, value: FormValue | undefined): PrintedValue {
  if (field.type === 'checklist') return checklistLines(field, value);
  if (field.type === 'table') return tableRows(field, value);
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value !== 'string') return '';
  return field.type === 'date' && value !== '' ? printedDate(value) : value;
}

/** Cada campo del formato con su valor impreso, por nombre interno. */
export function printedValues(
  definition: FormDefinition,
  data: FormData,
): Record<string, PrintedValue> {
  return Object.fromEntries(
    formFields(definition).map((field) => [field.key, printedValue(field, data[field.key])]),
  );
}
