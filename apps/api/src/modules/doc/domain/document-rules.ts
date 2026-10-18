import {
  VERSION_SOURCE_TYPES,
  type AllowedFileType,
  type VersionAction,
  type VersionStatus,
} from '@arza/contracts';

// Reglas de los documentos y sus versiones (B18, ficha 17.4). Sin base de datos: las usan los
// casos de uso y se prueban solas.

/** Pasos del ciclo de una versión: desde qué estado y a cuál lleva cada uno. */
export const VERSION_TRANSITIONS = {
  submit: { from: 'draft', to: 'in_review' },
  reject: { from: 'in_review', to: 'draft' },
  approve: { from: 'in_review', to: 'approved' },
  publish: { from: 'approved', to: 'current' },
  obsolete: { from: 'current', to: 'obsolete' },
} as const satisfies Record<
  Exclude<VersionAction, 'edit'>,
  { from: VersionStatus; to: VersionStatus }
>;

export type VersionStep = keyof typeof VERSION_TRANSITIONS;

const VERSION_STEPS: readonly VersionStep[] = [
  'submit',
  'reject',
  'approve',
  'publish',
  'obsolete',
];

/** Estados de una versión en trámite: a lo más una por documento. */
export const OPEN_STATUSES: readonly VersionStatus[] = ['draft', 'in_review', 'approved'];

/** Número visible de la versión: 00, 01… (la carga inicial empieza en 00, numeral 18.2). */
export function versionLabel(versionNumber: number): string {
  return String(versionNumber).padStart(2, '0');
}

export function nextVersionNumber(latest: number | null): number {
  return latest === null ? 0 : latest + 1;
}

export function isVersionSource(type: AllowedFileType): boolean {
  return VERSION_SOURCE_TYPES.includes(type);
}

/** Un PDF no se convierte: es su propio PDF. */
export function needsRendering(type: AllowedFileType): boolean {
  return type !== 'application/pdf';
}

/** Consecutivo sin año de PR-SGC-001 para un tipo y un proceso: PR-SGC-001, PR-SGC-002… */
export interface CodeSequence {
  readonly key: string;
  readonly name: string;
  readonly prefix: string;
  readonly padding: number;
}

/** Sin proceso (el RIT-001), el consecutivo es solo del tipo: RIT-001, RIT-002… */
export function controlledCodeSequence(docType: string, processCode: string | null): CodeSequence {
  const parts = processCode === null ? [docType] : [docType, processCode];
  return {
    key: `doc.code.${parts.map((part) => part.toLowerCase()).join('.')}`,
    name: `Documentos ${parts.join('-')}`,
    prefix: parts.join('-'),
    padding: 3,
  };
}

/** Consecutivo anual de los documentos de expediente: DOC-2026-0001. */
export const CASE_DOCUMENT_SEQUENCE = 'doc.case_document';

/**
 * Lo que la persona puede hacer, según sus permisos, si elaboró la versión y si atiende el paso
 * actual del trámite (B19): tiene abierta la tarea de aprobación o la de publicación.
 */
export interface VersionActor {
  readonly isAuthor: boolean;
  readonly canEdit: boolean;
  readonly canSubmit: boolean;
  readonly canReview: boolean;
  readonly canApprove: boolean;
  readonly canPublish: boolean;
  readonly canObsolete: boolean;
  readonly attendsApproval: boolean;
  readonly attendsAction: boolean;
}

export interface VersionState {
  readonly status: VersionStatus;
  readonly pdfReady: boolean;
  /** Estado del trámite en el motor de flujos; null si la versión aún no tiene trámite. */
  readonly step: string | null;
}

/** Permiso con el que se decide cada estado de aprobación del trámite de una versión. */
function decides(version: VersionState, actor: VersionActor): boolean {
  if (actor.isAuthor || !actor.attendsApproval) return false;
  if (version.step === 'review') return actor.canReview;
  if (version.step === 'approval') return actor.canApprove;
  return false;
}

function stepAllowed(step: VersionStep, version: VersionState, actor: VersionActor): boolean {
  switch (step) {
    case 'submit':
      return actor.isAuthor && actor.canSubmit && version.pdfReady;
    case 'reject':
    case 'approve':
      return decides(version, actor);
    case 'publish':
      return actor.canPublish && actor.attendsAction;
    case 'obsolete':
      return actor.canObsolete;
  }
}

/** Pasos posibles ahora: los botones de la ficha y lo que la API acepta. */
export function allowedActions(version: VersionState, actor: VersionActor): VersionAction[] {
  const actions: VersionAction[] = [];
  if (version.status === 'draft' && actor.isAuthor && actor.canEdit) actions.push('edit');
  for (const step of VERSION_STEPS) {
    const from: VersionStatus = VERSION_TRANSITIONS[step].from;
    if (from === version.status && stepAllowed(step, version, actor)) actions.push(step);
  }
  return actions;
}
