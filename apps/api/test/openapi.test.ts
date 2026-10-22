import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { buildOpenApiDocument } from '../src/platform/openapi/openapi.js';
import { createTestApp } from './support/test-app.js';

/** Rutas publicadas, en orden alfabético. */
const API_PATHS = [
  '/health',
  '/v1/access-review',
  '/v1/attachments',
  '/v1/attachments/{id}',
  '/v1/attachments/{id}/download-link',
  '/v1/audit-events',
  '/v1/audit-events/verify-chain',
  '/v1/audit-exports',
  '/v1/auth/invitation/accept',
  '/v1/auth/login',
  '/v1/auth/logout',
  '/v1/auth/mfa/setup',
  '/v1/auth/mfa/setup/confirm',
  '/v1/auth/mfa/verify',
  '/v1/auth/password/forgot',
  '/v1/auth/password/reset',
  '/v1/auth/reauthenticate',
  '/v1/auth/session',
  '/v1/business-days',
  '/v1/catalogs',
  '/v1/catalogs/{key}',
  '/v1/catalogs/{key}/items',
  '/v1/catalogs/{key}/items/{id}',
  '/v1/change-requests',
  '/v1/change-requests/{id}',
  '/v1/change-requests/{id}/actions/{step}',
  '/v1/comments',
  '/v1/comments/{id}',
  '/v1/consents',
  '/v1/consents/{id}',
  '/v1/consents/{id}/actions/revoke',
  '/v1/cost-centers',
  '/v1/cost-centers/{id}',
  '/v1/crm/activities',
  '/v1/crm/activities/{id}',
  '/v1/crm/activities/{id}/actions/complete',
  '/v1/crm/campaigns',
  '/v1/crm/campaigns/{id}',
  '/v1/crm/leads',
  '/v1/crm/leads/authorization-notices',
  '/v1/crm/leads/{id}',
  '/v1/crm/leads/{id}/actions/convert',
  '/v1/crm/leads/{id}/actions/discard',
  '/v1/crm/leads/{id}/actions/qualify',
  '/v1/crm/opportunities',
  '/v1/crm/opportunities/{id}',
  '/v1/crm/opportunities/{id}/actions/lose',
  '/v1/crm/opportunities/{id}/actions/move',
  '/v1/crm/opportunities/{id}/actions/win',
  '/v1/crm/reports/funnel',
  '/v1/crm/reports/funnel/export',
  '/v1/delegations',
  '/v1/delegations/{id}/actions/revoke',
  '/v1/dispositions',
  '/v1/dispositions/propose',
  '/v1/dispositions/{id}',
  '/v1/dispositions/{id}/actions/send',
  '/v1/dispositions/{id}/actions/{decision}',
  '/v1/dispositions/{id}/certificate',
  '/v1/dispositions/{id}/items/{itemId}',
  '/v1/documents',
  '/v1/documents/search',
  '/v1/documents/{id}',
  '/v1/documents/{id}/acknowledgement-requests',
  '/v1/documents/{id}/acknowledgements',
  '/v1/documents/{id}/acknowledgements/mine',
  '/v1/documents/{id}/links',
  '/v1/documents/{id}/links/{linkId}',
  '/v1/documents/{id}/retention-rule',
  '/v1/documents/{id}/versions',
  '/v1/entities/{type}/{id}/history',
  '/v1/files',
  '/v1/files/downloads/{token}',
  '/v1/files/uploads/{token}',
  '/v1/files/{id}',
  '/v1/files/{id}/download-link',
  '/v1/folders',
  '/v1/folders/{id}',
  '/v1/form-records',
  '/v1/form-records/{id}',
  '/v1/form-records/{id}/actions/{step}',
  '/v1/form-records/{id}/pdf',
  '/v1/form-templates',
  '/v1/form-templates/{id}',
  '/v1/form-templates/{id}/actions/publish',
  '/v1/form-templates/{id}/actions/retire',
  '/v1/form-templates/{id}/preview',
  '/v1/holidays',
  '/v1/holidays/{id}',
  '/v1/master-list',
  '/v1/master-list/export',
  '/v1/me',
  '/v1/me/mfa',
  '/v1/me/mfa/disable',
  '/v1/me/mfa/recovery-codes',
  '/v1/me/notification-preferences',
  '/v1/me/notifications',
  '/v1/me/notifications/read-all',
  '/v1/me/notifications/{id}/read',
  '/v1/me/password',
  '/v1/me/permissions',
  '/v1/me/sessions',
  '/v1/me/sessions/revoke-others',
  '/v1/me/sessions/{id}/revoke',
  '/v1/notices',
  '/v1/notices/{id}',
  '/v1/notices/{id}/actions/publish',
  '/v1/notification-templates',
  '/v1/notification-templates/{kind}',
  '/v1/org-units',
  '/v1/org-units/{id}',
  '/v1/output-templates',
  '/v1/output-templates/{id}',
  '/v1/output-templates/{id}/actions/publish',
  '/v1/output-templates/{id}/preview',
  '/v1/parameters',
  '/v1/parameters/{key}/history',
  '/v1/parameters/{key}/versions',
  '/v1/parties',
  '/v1/parties/authorization-notices',
  '/v1/parties/search',
  '/v1/parties/{id}',
  '/v1/parties/{id}/actions/change-status',
  '/v1/parties/{id}/bank-accounts',
  '/v1/parties/{id}/bank-accounts/{accountId}/actions/approve',
  '/v1/parties/{id}/bank-accounts/{accountId}/actions/reject',
  '/v1/parties/{id}/bank-accounts/{accountId}/actions/reveal',
  '/v1/parties/{id}/consents',
  '/v1/parties/{id}/contacts',
  '/v1/parties/{id}/contacts/{contactId}',
  '/v1/parties/{id}/due-diligence',
  '/v1/parties/{id}/due-diligence/{reviewId}/actions/approve',
  '/v1/parties/{id}/due-diligence/{reviewId}/actions/reject',
  '/v1/parties/{id}/merge',
  '/v1/parties/{id}/roles',
  '/v1/parties/{id}/roles/{role}',
  '/v1/parties/{id}/timeline',
  '/v1/permissions',
  '/v1/positions',
  '/v1/positions/{id}',
  '/v1/processing-activities',
  '/v1/processing-activities/{id}',
  '/v1/processors',
  '/v1/processors/{id}',
  '/v1/retention-rules',
  '/v1/retention-rules/unassigned-documents',
  '/v1/retention-rules/{id}',
  '/v1/roles',
  '/v1/roles/{id}',
  '/v1/security-events',
  '/v1/sequences',
  '/v1/sequences/{id}',
  '/v1/sessions/actions/revoke-all',
  '/v1/sites',
  '/v1/sites/{id}',
  '/v1/tasks',
  '/v1/tasks/mine',
  '/v1/tasks/{id}',
  '/v1/tasks/{id}/actions/approve',
  '/v1/tasks/{id}/actions/complete',
  '/v1/tasks/{id}/actions/delegate',
  '/v1/tasks/{id}/actions/reassign',
  '/v1/tasks/{id}/actions/reject',
  '/v1/tasks/{id}/actions/start',
  '/v1/tenant',
  '/v1/users',
  '/v1/users/{id}',
  '/v1/users/{id}/actions/invite',
  '/v1/users/{id}/actions/lock',
  '/v1/users/{id}/actions/reset-mfa',
  '/v1/users/{id}/actions/revoke-sessions',
  '/v1/users/{id}/actions/unlock',
  '/v1/users/{id}/roles',
  '/v1/users/{id}/roles/{assignmentId}/actions/revoke',
  '/v1/versions/{id}',
  '/v1/versions/{id}/actions/approve',
  '/v1/versions/{id}/actions/obsolete',
  '/v1/versions/{id}/actions/publish',
  '/v1/versions/{id}/actions/reject',
  '/v1/versions/{id}/actions/submit',
  '/v1/versions/{id}/download-link',
  '/v1/workflow-instances/{id}',
  '/v1/workflow-instances/{id}/actions/{action}',
  '/v1/workflows',
  '/v1/workflows/{id}',
  '/v1/workflows/{id}/actions/new-version',
  '/v1/workflows/{id}/actions/publish',
  '/v1/workflows/{id}/actions/start-test',
  '/version',
];

let app: NestExpressApplication | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('OpenAPI generado desde los esquemas Zod (ADR-010)', () => {
  it('coincide con apps/api/openapi.json guardado en el repositorio', async () => {
    app = await createTestApp();
    const document = `${JSON.stringify(buildOpenApiDocument(app), null, 2)}\n`;
    // Si cambia un contrato, regenere el archivo con: pnpm --filter @arza/api test -u
    await expect(document).toMatchFileSnapshot('../openapi.json');
  });
});

describe('rutas y esquemas del OpenAPI', () => {
  it('describe cada ruta con el esquema de su contrato', async () => {
    app = await createTestApp();
    const document = buildOpenApiDocument(app);
    expect(document.openapi).toBe('3.1.0');
    expect(Object.keys(document.paths).sort()).toEqual(API_PATHS);
    expect(Object.keys(document.components?.schemas ?? {})).toEqual(
      expect.arrayContaining([
        'HealthResponse_Output',
        'VersionResponse_Output',
        'ErrorResponse_Output',
        'LoginRequest',
        'SessionResponse_Output',
        'MeResponse_Output',
        'ChangePasswordRequest',
        'SecondFactorRequest',
        'SecondFactorConfirmResponse_Output',
        'ReauthenticateRequest',
        'ActiveSessionsResponse_Output',
        'MyPermissionsResponse_Output',
        'UserDetailResponse_Output',
        'InviteUserRequest',
        'RoleDetailResponse_Output',
        'CreateRoleRequest',
        'CreateDelegationRequest',
        'AccessReviewResponse_Output',
      ]),
    );
  });
});

describe('publicación de la documentación', () => {
  it('publica la documentación en local y en pruebas', async () => {
    app = await createTestApp({ env: { APP_ENV: 'staging' } });
    const response = await request(app.getHttpServer()).get('/api/docs/openapi.json');
    expect(response.status).toBe(200);
  });

  it('no publica la documentación en producción', async () => {
    app = await createTestApp({ env: { APP_ENV: 'production' } });
    const response = await request(app.getHttpServer()).get('/api/docs/openapi.json');
    expect(response.status).toBe(404);
  });
});
