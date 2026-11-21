// Interfaz pública de Seguridad y salud en el trabajo (M13, B37). Se publica también como
// «@arza/api/sst» para el worker.
export { SstModule } from './interface/sst.module.js';
export { runSstDailyWork } from './application/daily-work.js';
export { incidentRefForQuality } from './application/quality-link.js';
