// Interfaz pública de multiempresa (M00, B48). Se publica también como «@arza/api/tenancy» para el
// worker, que genera las exportaciones y ejecuta las eliminaciones vencidas.
export { TenancyModule } from './interface/tenancy.module.js';
export { runTenantExportWork } from './application/export-work.js';
export { runTenantPurgeWork } from './application/purge-work.js';
