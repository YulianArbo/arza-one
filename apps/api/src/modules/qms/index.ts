// Interfaz pública de Calidad y mejora continua (M14, B38). Se publica también como
// «@arza/api/qms» para el worker. Servicio al cliente abre aquí la no conformidad de una queja o
// un reclamo procedente (decisión 4). El worker calcula los indicadores y genera los PDF (B39).
export { QmsModule } from './interface/qms.module.js';
export { runQmsDailyWork } from './application/daily-work.js';
export { runQmsIndicatorWork } from './application/indicator-work.js';
export { renderQualityPdfs, type QualityPdfDependencies } from './application/quality-pdf-work.js';
export { openNonconformityFromPqrsf } from './application/nonconformity-origins.js';
