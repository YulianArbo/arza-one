// Interfaz pública de Finanzas (M10). En B23 solo trae los parámetros tributarios: las cotizaciones
// leen la tarifa vigente de cada impuesto con taxRatesOn; nunca leen la tabla fin_tax_parameters.
export { FinModule } from './interface/fin.module.js';
export { seedTaxParameters } from './application/tax-seed.js';
export { taxLabels, taxRatesOn, type TaxRate } from './application/tax-parameters.js';
