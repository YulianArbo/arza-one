// Rutas del núcleo (M00) que publica la API: catálogos y centros de costo (B12) y comunicados del
// acceso (B36A). Se suman a API_PATHS.

export const CORE_PATHS = [
  '/v1/announcements',
  '/v1/announcements/uploads',
  '/v1/announcements/{id}',
  '/v1/announcements/{id}/end',
  '/v1/announcements/{id}/image',
  '/v1/catalogs',
  '/v1/catalogs/{key}',
  '/v1/catalogs/{key}/items',
  '/v1/catalogs/{key}/items/{id}',
  '/v1/cost-centers',
  '/v1/cost-centers/{id}',
  '/v1/public/announcements',
  '/v1/public/announcements/{id}/image',
];
