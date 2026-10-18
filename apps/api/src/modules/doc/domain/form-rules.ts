import type {
  FormRecordAction,
  FormRecordStatus,
  FormTemplateAction,
  FormTemplateStatus,
  OutputTemplateAction,
  OutputTemplateStatus,
  PdfStatus,
} from '@arza/contracts';

import { FORM_RECORD_STATES } from './form-flows.js';

// Reglas de los formatos digitales y sus registros (B20, ficha 17.4): qué puede hacer cada persona
// según el estado. Quien diligencia un registro no lo aprueba; un formato publicado no cambia.

export interface TemplateState {
  readonly status: FormTemplateStatus;
  readonly fillMode: 'manual' | 'system';
  /** Ya existe un borrador de este mismo código. */
  readonly draftExists: boolean;
}

export interface TemplatePerson {
  readonly manages: boolean;
  readonly fills: boolean;
}

export function templateActions(
  state: TemplateState,
  person: TemplatePerson,
): FormTemplateAction[] {
  const actions: FormTemplateAction[] = [];
  if (person.manages && state.status === 'draft') actions.push('edit', 'publish');
  if (person.manages && state.status === 'published') {
    actions.push('retire');
    if (!state.draftExists) actions.push('new_version');
  }
  if (person.fills && state.status === 'published' && state.fillMode === 'manual')
    actions.push('fill');
  return actions;
}

export function outputTemplateActions(
  status: OutputTemplateStatus,
  draftExists: boolean,
): OutputTemplateAction[] {
  if (status === 'draft') return ['edit', 'publish'];
  return status === 'published' && !draftExists ? ['new_version'] : [];
}

export interface RecordState {
  readonly status: FormRecordStatus;
  readonly pdfStatus: PdfStatus;
  /** Paso del trámite de aprobación, si está en él. */
  readonly step: string | null;
}

export interface RecordPerson {
  readonly isAuthor: boolean;
  readonly canFill: boolean;
  readonly canApprove: boolean;
  /** Tiene abierta la tarea de aprobación del trámite. */
  readonly attendsApproval: boolean;
}

export function recordActions(state: RecordState, person: RecordPerson): FormRecordAction[] {
  const actions: FormRecordAction[] = [];
  if (state.status === 'draft' && person.isAuthor && person.canFill) actions.push('edit', 'submit');
  const approving = state.status === 'in_approval' && state.step === FORM_RECORD_STATES.approval;
  if (approving && person.canApprove && person.attendsApproval && !person.isAuthor) {
    actions.push('approve', 'reject');
  }
  if (state.status === 'completed' && state.pdfStatus === 'ready') actions.push('download');
  return actions;
}

/** Consecutivo de los registros de un formato: doc.form_record.ft_com_002. */
export function recordSequenceKey(formCode: string): string {
  return `doc.form_record.${formCode.toLowerCase().replaceAll('-', '_')}`;
}

/** Versión del formato como se imprime en el encabezado: 1 → 01. */
export function printedFormVersion(formVersion: number): string {
  return String(formVersion).padStart(2, '0');
}
