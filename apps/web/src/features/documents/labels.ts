import {
  CLASSIFICATIONS,
  LINK_ENTITIES,
  LINK_RELATIONS,
  VERSION_SOURCE_TYPES,
  type Classification,
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
};

export const DOCUMENT_STATUS_TONES: Readonly<Record<DocumentStatus, Tone>> = {
  draft: 'warning',
  current: 'success',
  obsolete: 'neutral',
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
