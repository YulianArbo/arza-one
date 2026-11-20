// Interfaz pública de Activos (M11, B34). Los demás módulos se enteran de lo que pasa aquí por los
// eventos «ast.*» de la bandeja de salida; nunca leen las tablas ast_. Talento humano pregunta
// aquí qué activos debe devolver un colaborador. Se publica también como «@arza/api/asset» para el
// worker, que envía los comodatos a firma y cierra las asignaciones.
export { AssetModule } from './interface/asset.module.js';
export { assetsHeldBy, type HeldAsset } from './application/asset-holders.js';
export { followLoans, type LoanWorkResult } from './application/loan-work.js';
