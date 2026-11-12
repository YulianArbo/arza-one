// Rutas de Finanzas (M10) que publica la API, incluidas facturas, notas crédito y recaudos (B31);
// se suman a API_PATHS.
export const FINANCE_PATHS = [
  '/v1/finance/invoices',
  '/v1/finance/invoices/billable-milestones',
  '/v1/finance/invoices/{id}',
  '/v1/finance/invoices/{id}/approval',
  '/v1/finance/invoices/{id}/credit-notes',
  '/v1/finance/invoices/{id}/fiscal-document',
  '/v1/finance/invoices/{id}/payments',
  '/v1/finance/invoices/{id}/void',
  '/v1/finance/tax-parameters',
  '/v1/finance/tax-parameters/versions',
  '/v1/finance/tax-parameters/{key}/history',
];
