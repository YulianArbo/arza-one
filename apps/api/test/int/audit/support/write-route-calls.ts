import type request from 'supertest';

import type { AccessScenario } from '../../iam/support/access-scenario.js';
import { ACCESS_ROUTE_CALLS } from './access-route-calls.js';
import { AI_ROUTE_CALLS } from './ai-route-calls.js';
import { ASSET_ROUTE_CALLS } from './asset-route-calls.js';
import { AUTH_ROUTE_CALLS } from './auth-route-calls.js';
import { CARE_ROUTE_CALLS } from './care-route-calls.js';
import { CONTRACT_ROUTE_CALLS } from './contract-route-calls.js';
import { ANNOUNCEMENT_CALLS } from './announcement-route-calls.js';
import { CORE_CALLS } from './core-route-calls.js';
import { CRM_ROUTE_CALLS } from './crm-route-calls.js';
import { DOC_DOCUMENT_ROUTE_CALLS } from './doc-document-route-calls.js';
import { DOC_FORM_ROUTE_CALLS } from './doc-form-route-calls.js';
import { DOC_REQUEST_ROUTE_CALLS } from './doc-request-route-calls.js';
import { DOC_RETENTION_ROUTE_CALLS } from './doc-retention-route-calls.js';
import { DOC_ROUTE_CALLS } from './doc-route-calls.js';
import { FINANCE_ROUTE_CALLS } from './finance-route-calls.js';
import { HR_ABSENCE_ROUTE_CALLS } from './hr-absence-route-calls.js';
import { HR_PEOPLE_ROUTE_CALLS } from './hr-people-route-calls.js';
import { HR_ROUTE_CALLS } from './hr-route-calls.js';
import { LEDGER_ROUTE_CALLS } from './ledger-route-calls.js';
import { MEDIA_ROUTE_CALLS } from './media-route-calls.js';
import { NTF_ROUTE_CALLS } from './ntf-route-calls.js';
import { PARTY_ROUTE_CALLS } from './party-route-calls.js';
import { PORTAL_ROUTE_CALLS } from './portal-route-calls.js';
import { PRIVACY_REQUEST_ROUTE_CALLS } from './privacy-request-route-calls.js';
import { PRIVACY_ROUTE_CALLS } from './privacy-route-calls.js';
import { PROJECT_CONTROL_ROUTE_CALLS } from './project-control-route-calls.js';
import { PROJECT_ROUTE_CALLS } from './project-route-calls.js';
import { PURCHASE_ROUTE_CALLS } from './purchase-route-calls.js';
import { QUOTE_ROUTE_CALLS } from './quote-route-calls.js';
import { SERVICE_ROUTE_CALLS } from './service-route-calls.js';
import { QMS_AUDIT_ROUTE_CALLS } from './qms-audit-route-calls.js';
import { INN_ROUTE_CALLS } from './inn-route-calls.js';
import { QMS_REVIEW_ROUTE_CALLS } from './qms-review-route-calls.js';
import { QMS_LEGAL_ROUTE_CALLS } from './qms-legal-route-calls.js';
import { QMS_ROUTE_CALLS } from './qms-route-calls.js';
import { SST_PEOPLE_ROUTE_CALLS } from './sst-people-route-calls.js';
import { SST_ROUTE_CALLS } from './sst-route-calls.js';
import { TENANCY_ROUTE_CALLS } from './tenancy-route-calls.js';
import { WEB_ROUTE_CALLS } from './web-route-calls.js';
import { WF_ROUTE_CALLS } from './wf-route-calls.js';

// Una petición válida a cada ruta de la API que escribe (B11, criterio de la ficha 17.20). Cada
// llamada prepara lo que necesita y devuelve la petición final sin enviar, para que la prueba le
// ponga su identificador de correlación y busque el evento de auditoría con ese identificador.

/** La petición va dentro de un objeto: una función async que la devolviera sola la enviaría. */
interface PendingRequest {
  readonly test: request.Test;
}

export type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

/** Ruta del OpenAPI («POST /v1/users/{id}/roles») → cómo llamarla. */
export const WRITE_ROUTE_CALLS: Readonly<Record<string, RouteCall>> = {
  ...AUTH_ROUTE_CALLS,
  ...AI_ROUTE_CALLS,
  ...TENANCY_ROUTE_CALLS,
  ...ACCESS_ROUTE_CALLS,
  ...HR_ROUTE_CALLS,
  ...HR_ABSENCE_ROUTE_CALLS,
  ...HR_PEOPLE_ROUTE_CALLS,
  ...SST_ROUTE_CALLS,
  ...SST_PEOPLE_ROUTE_CALLS,
  ...QMS_ROUTE_CALLS,
  ...QMS_AUDIT_ROUTE_CALLS,
  ...QMS_REVIEW_ROUTE_CALLS,
  ...CORE_CALLS,
  ...ANNOUNCEMENT_CALLS,
  ...PARTY_ROUTE_CALLS,
  ...DOC_ROUTE_CALLS,
  ...DOC_DOCUMENT_ROUTE_CALLS,
  ...DOC_REQUEST_ROUTE_CALLS,
  ...DOC_FORM_ROUTE_CALLS,
  ...DOC_RETENTION_ROUTE_CALLS,
  ...WF_ROUTE_CALLS,
  ...NTF_ROUTE_CALLS,
  ...PRIVACY_ROUTE_CALLS,
  ...PRIVACY_REQUEST_ROUTE_CALLS,
  ...CRM_ROUTE_CALLS,
  ...QUOTE_ROUTE_CALLS,
  ...CONTRACT_ROUTE_CALLS,
  ...PROJECT_ROUTE_CALLS,
  ...PROJECT_CONTROL_ROUTE_CALLS,
  ...SERVICE_ROUTE_CALLS,
  ...CARE_ROUTE_CALLS,
  ...PORTAL_ROUTE_CALLS,
  ...FINANCE_ROUTE_CALLS,
  ...LEDGER_ROUTE_CALLS,
  ...PURCHASE_ROUTE_CALLS,
  ...ASSET_ROUTE_CALLS,
  ...MEDIA_ROUTE_CALLS,
  // Innovación publica todos los formatos piloto (FT-SGC-002 incluido), y con la lista de
  // verificación publicada las versiones de Documentos ya no se aprueban sin ella: va después.
  ...INN_ROUTE_CALLS,
  // Normograma y objetivos estratégicos (B46): al final, como Innovación.
  ...QMS_LEGAL_ROUTE_CALLS,
  // El sitio publica los términos de la plataforma (en la otra empresa): va al final.
  ...WEB_ROUTE_CALLS,
};
