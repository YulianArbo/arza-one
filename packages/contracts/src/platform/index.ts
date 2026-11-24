export {
  PLATFORM_ERROR_CODES,
  errorResponseSchema,
  type ErrorDetail,
  type ErrorResponse,
} from './error-response.js';
export {
  HEALTH_COMPONENTS,
  healthResponseSchema,
  type ComponentStatus,
  type HealthComponent,
  type HealthResponse,
} from './health.js';
export { versionResponseSchema, type VersionResponse } from './version.js';
export {
  OPS_ALERTS,
  opsStatusResponseSchema,
  type OpsAlert,
  type OpsStatusResponse,
} from './ops-status.js';
