import {
  CLASSIFICATIONS,
  LINK_ENTITIES,
  LINK_RELATIONS,
  VERSION_SOURCE_TYPES,
  type ChangeRequestStatus,
  type ChangeRequestStep,
  type Classification,
  type DispositionProposalStatus,
  type DocumentStatus,
  type RenderStatus,
  type VersionAction,
  type VersionStatus,
} from '@arza/contracts';

// Textos de documentos, versiones y expedientes (B18, numeral 16.6: sin jerga, trato de usted).

type Tone = 'neutral' | 'success' | 'warning' | 'destructive' | 'info';

export const DOCUMENTS_PATH = '/app/documentos';

export function documentPath(id: string): string {
  return `${DOCUMENTS_PATH}/${id}`;
}

export function versionFormPath(id: string): string {
  return `${DOCUMENTS_PATH}/${id}/version`;
}

export function newDocumentPath(folderId: string | null): string {
  return folderId === null
    ? `${DOCUMENTS_PATH}/nuevo`
    : `${DOCUMENTS_PATH}/nuevo?carpeta=${folderId}`;
}

export const DOCUMENT_STATUS_LABELS: Readonly<Record<DocumentStatus, string>> = {
  draft: 'Sin publicar',
  current: 'Vigente',
  obsolete: 'Obsoleto',
  disposed: 'Eliminado por disposición',
};

export const DOCUMENT_STATUS_TONES: Readonly<Record<DocumentStatus, Tone>> = {
  draft: 'warning',
  current: 'success',
  obsolete: 'neutral',
  disposed: 'destructive',
};

export const VERSION_STATUS_LABELS: Readonly<Record<VersionStatus, string>> = {
  draft: 'Borrador',
  in_review: 'En revisión',
  approved: 'Aprobada',
  current: 'Vigente',
  obsolete: 'Obsoleta',
};

export const VERSION_STATUS_TONES: Readonly<Record<VersionStatus, Tone>> = {
  draft: 'warning',
  in_review: 'info',
  approved: 'info',
  current: 'success',
  obsolete: 'neutral',
};

export const RENDER_LABELS: Readonly<Record<RenderStatus, string>> = {
  pending: 'Convirtiendo a PDF…',
  ready: 'PDF listo',
  failed: 'No se pudo convertir a PDF: revise el archivo y súbalo de nuevo',
};

export const ACTION_LABELS: Readonly<Record<Exclude<VersionAction, 'edit'>, string>> = {
  submit: 'Enviar a revisión',
  reject: 'Devolver',
  approve: 'Aprobar',
  publish: 'Publicar',
  obsolete: 'Declarar obsoleta',
};

const CLASSIFICATION_HINTS: Readonly<Record<Classification, string>> = {
  public: 'Lo puede ver cualquier persona de la empresa.',
  internal: 'Lo ven las personas de la empresa con acceso a documentos.',
  confidential: 'Cada descarga queda en el registro de accesos.',
  restricted: 'Solo lo ven las personas con permiso nominal; cada consulta queda registrada.',
};

export const CLASSIFICATION_OPTIONS = Object.entries(CLASSIFICATIONS).map(([value, label]) => ({
  value,
  label,
}));

export const LINK_ENTITY_OPTIONS = Object.entries(LINK_ENTITIES).map(([value, label]) => ({
  value,
  label,
}));

export const LINK_RELATION_OPTIONS = Object.entries(LINK_RELATIONS).map(([value, label]) => ({
  value,
  label,
}));

/** Lo que acepta el selector del archivo fuente: PDF, Word y Excel. */
export const SOURCE_ACCEPT = [...VERSION_SOURCE_TYPES, '.pdf', '.docx', '.xlsx'].join(',');

export const SOURCE_HINT =
  'PDF, Word (.docx) o Excel (.xlsx), hasta 20 MB. Word y Excel se convierten a PDF para el visor.';

export function isSourceType(type: string): boolean {
  return VERSION_SOURCE_TYPES.some((allowed) => allowed === type);
}

/** Ayuda de la clasificación elegida en un formulario. */
export function classificationHint(value: string): string | undefined {
  return Object.entries(CLASSIFICATION_HINTS).find(([key]) => key === value)?.[1];
}

// Control documental del SGC (B19): Listado Maestro y Solicitud de Acción Documental.

export const MASTER_LIST_PATH = `${DOCUMENTS_PATH}/listado-maestro`;
export const REQUESTS_PATH = `${DOCUMENTS_PATH}/solicitudes`;
export const NEW_REQUEST_PATH = `${REQUESTS_PATH}/nueva`;

export function requestPath(id: string): string {
  return `${REQUESTS_PATH}/${id}`;
}

/** Solicitud nueva ya dirigida a un documento: modificarlo o eliminarlo. */
export function newRequestFor(documentId: string, action: 'update' | 'obsolete'): string {
  return `${NEW_REQUEST_PATH}?documento=${documentId}&accion=${action}`;
}

export const REQUEST_STATUS_TONES: Readonly<Record<ChangeRequestStatus, Tone>> = {
  filed: 'info',
  in_analysis: 'info',
  approved: 'success',
  rejected: 'destructive',
  executed: 'neutral',
};

export const REQUEST_STEP_LABELS: Readonly<Record<ChangeRequestStep, string>> = {
  analyze: 'Empezar el análisis',
  approve: 'Aprobar',
  reject: 'Rechazar',
};

// Retención y disposición final (B21): tabla de retención (RE-SGC-005) y propuestas mensuales.

export const RETENTION_PATH = `${DOCUMENTS_PATH}/retencion`;
export const DISPOSITIONS_PATH = `${DOCUMENTS_PATH}/disposicion`;

export function dispositionPath(id: string): string {
  return `${DISPOSITIONS_PATH}/${id}`;
}

export const DISPOSITION_STATUS_TONES: Readonly<Record<DispositionProposalStatus, Tone>> = {
  review: 'info',
  in_approval: 'warning',
  approved: 'info',
  rejected: 'destructive',
  executed: 'success',
};

/** «2026-10-01» → «octubre de 2026». */
export function periodLabel(period: string): string {
  const date = new Date(`${period}T12:00:00Z`);
  return new Intl.DateTimeFormat('es-CO', {
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  }).format(date);
}

/** Años de una regla, en palabras: «2 años en gestión y 8 en el archivo central». */
export function retentionYears(active: number, archive: number): string {
  const unit = (years: number) => (years === 1 ? 'año' : 'años');
  return `${String(active)} ${unit(active)} en gestión y ${String(archive)} en el archivo central`;
}
