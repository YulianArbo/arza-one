import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { buildOpenApiDocument } from '../src/platform/openapi/openapi.js';
import { createTestApp } from './support/test-app.js';

/** Rutas publicadas, en orden alfabético. */
const API_PATHS = [
  '/health',
  '/v1/access-review',
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
  '/v1/delegations',
  '/v1/delegations/{id}/actions/revoke',
  '/v1/me',
  '/v1/me/mfa',
  '/v1/me/mfa/disable',
  '/v1/me/mfa/recovery-codes',
  '/v1/me/password',
  '/v1/me/permissions',
  '/v1/me/sessions',
  '/v1/me/sessions/revoke-others',
  '/v1/me/sessions/{id}/revoke',
  '/v1/permissions',
  '/v1/roles',
  '/v1/roles/{id}',
  '/v1/sessions/actions/revoke-all',
  '/v1/users',
  '/v1/users/{id}',
  '/v1/users/{id}/actions/invite',
  '/v1/users/{id}/actions/lock',
  '/v1/users/{id}/actions/reset-mfa',
  '/v1/users/{id}/actions/revoke-sessions',
  '/v1/users/{id}/actions/unlock',
  '/v1/users/{id}/roles',
  '/v1/users/{id}/roles/{assignmentId}/actions/revoke',
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
