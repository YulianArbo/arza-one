// Rutas de la Dirección (M16, B46) que publica la API: tableros, normograma y objetivos
// estratégicos. Se suman a API_PATHS.
export const DIRECTION_PATHS = [
  '/v1/dashboards/compliance/data',
  '/v1/dashboards/compliance/drilldown',
  '/v1/dashboards/executive/data',
  '/v1/dashboards/executive/drilldown',
  '/v1/dashboards/scorecard/data',
  '/v1/qms/legal-requirements',
  '/v1/qms/legal-requirements/export',
  '/v1/qms/legal-requirements/import',
  '/v1/qms/legal-requirements/{id}',
  '/v1/qms/legal-requirements/{id}/evaluations',
  '/v1/qms/strategic-objectives',
  '/v1/qms/strategic-objectives/{id}',
  '/v1/qms/strategic-objectives/{id}/indicators',
];
