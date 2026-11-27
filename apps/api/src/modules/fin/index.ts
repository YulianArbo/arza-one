// Interfaz pública de Finanzas (M10): parámetros tributarios y consulta de facturas para el portal.
// FinModule no se reexporta aquí: es el punto de composición de Nest y lo importa app.module.
// Reexportarlo haría que cualquier módulo que use esta interfaz arrastrara sus controladores y,
// con ellos, la lectura de hitos de Proyectos: un ciclo entre Finanzas, Proyectos y Contratos.
export { seedTaxParameters } from './application/tax-seed.js';
export { taxLabels, taxRatesOn } from './application/tax-parameters.js';
export {
  clientCreditNoteFile,
  clientInvoiceFile,
  clientInvoices,
} from './application/invoice-queries.js';
// Cifras del tablero gerencial (B46).
export {
  receivableFigures,
  salesFigure,
  type FinanceFigure,
} from './application/dashboard-figures.js';
