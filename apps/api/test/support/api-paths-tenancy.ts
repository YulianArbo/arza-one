// Rutas de multiempresa (M00, B48) que publica la API: empresas de la plataforma, marca propia y
// exportación completa. Se suman a API_PATHS.
export const TENANCY_PATHS = [
  '/v1/me/branding',
  '/v1/me/branding/logo',
  '/v1/platform/tenants',
  '/v1/platform/tenants/{id}/deletion',
  '/v1/platform/tenants/{id}/plan',
  '/v1/platform/tenants/{id}/reactivate',
  '/v1/platform/tenants/{id}/suspend',
  '/v1/tenant/branding',
  '/v1/tenant/branding/logo',
  '/v1/tenant/branding/logo/uploads',
  '/v1/tenant/exports',
  '/v1/tenant/exports/{id}/download',
];
