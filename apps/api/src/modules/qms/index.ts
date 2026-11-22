// Interfaz pública de Calidad y mejora continua (M14, B38). Se publica también como
// «@arza/api/qms» para el worker. Servicio al cliente abre aquí la no conformidad de una queja o
// un reclamo procedente (decisión 4).
export { QmsModule } from './interface/qms.module.js';
export { runQmsDailyWork } from './application/daily-work.js';
export { openNonconformityFromPqrsf } from './application/nonconformity-origins.js';
