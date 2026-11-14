// Rutas de la mesa de ayuda (B28) que publica la API; se suman a API_PATHS.

export const SERVICE_PATHS = [
  '/v1/sla-policies',
  '/v1/sla-policies/{id}',
  '/v1/tickets',
  '/v1/tickets/options',
  '/v1/tickets/{id}',
  '/v1/tickets/{id}/actions/assign',
  '/v1/tickets/{id}/actions/close',
  '/v1/tickets/{id}/actions/escalate',
  '/v1/tickets/{id}/actions/reopen',
  '/v1/tickets/{id}/actions/resolve',
  '/v1/tickets/{id}/actions/resume',
  '/v1/tickets/{id}/actions/start',
  '/v1/tickets/{id}/actions/wait',
  '/v1/tickets/{id}/compensations',
  '/v1/tickets/{id}/compensations/{compensationId}/actions/apply',
  '/v1/tickets/{id}/compensations/{compensationId}/actions/decide',
  '/v1/tickets/{id}/messages',
  '/v1/warranties',
  '/v1/warranties/{id}',
];
