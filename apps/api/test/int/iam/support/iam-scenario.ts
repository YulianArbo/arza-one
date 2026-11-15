import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  secondFactorConfirmResponseSchema,
  secondFactorSetupResponseSchema,
  type SecondFactorSetupResponse,
} from '@arza/contracts';
import request from 'supertest';
import { afterAll, beforeAll, expect } from 'vitest';

import { totpCodeAt } from '../../../../src/modules/iam/infrastructure/totp.js';
import type { DatabaseService } from '../../../../src/platform/database/database.service.js';
import type { TenantTransaction } from '../../../../src/platform/database/tenant-context.js';
import {
  createDatabaseService,
  createTenant,
  newTestTenant,
  type TestTenant,
} from '../../support/integration-database.js';
import {
  ManualClock,
  createIamTestApp,
  createUser,
  freshIp,
  postWithSession,
  signInWithPassword,
  tenantScope,
  uniqueEmail,
  type SignedIn,
} from './iam-fixtures.js';

// Escenario común de las pruebas de seguridad de sesión (B09): una o dos empresas, un reloj que
// las pruebas mueven y la API completa con PostgreSQL y Valkey reales.

export interface UserOptions {
  readonly tenantId?: string;
  readonly kind?: 'portal';
  readonly requireSecondFactor?: boolean;
  readonly withSecondFactor?: boolean;
}

export interface ConfiguredUser {
  readonly email: string;
  readonly id: string;
  readonly recoveryCodes: readonly string[];
  readonly secret: string;
}

export class IamScenario {
  readonly tenant: TestTenant;
  readonly otherTenant: TestTenant;
  readonly clock = new ManualClock();
  private database?: DatabaseService;
  private application?: NestExpressApplication;

  constructor(label: string) {
    this.tenant = newTestTenant(`${label} A`);
    this.otherTenant = newTestTenant(`${label} B`);
    beforeAll(async () => {
      this.database = createDatabaseService();
      await createTenant(this.database, this.tenant);
      await createTenant(this.database, this.otherTenant);
      // El sitio público de la API es el de la empresa del escenario (B29).
      this.application = await createIamTestApp(this.clock, {
        PUBLIC_SITE_TAX_ID: this.tenant.taxId,
      });
    });
    afterAll(async () => {
      await this.application?.close();
      await this.database?.onModuleDestroy();
    });
  }

  get db(): DatabaseService {
    if (this.database === undefined) throw new Error('El escenario no ha empezado.');
    return this.database;
  }

  get app(): NestExpressApplication {
    if (this.application === undefined) throw new Error('El escenario no ha empezado.');
    return this.application;
  }

  inTenant<T>(work: (tx: TenantTransaction) => Promise<T>): Promise<T> {
    return tenantScope(this.db, this.tenant.id)(work);
  }

  async newUser(label: string, options: UserOptions = {}): Promise<{ email: string; id: string }> {
    const email = uniqueEmail(label);
    const tenantId = options.tenantId ?? this.tenant.id;
    const id = await createUser(this.db, { ...options, tenantId, email });
    return { email, id };
  }

  /** Cada lectura llega desde otra dirección, como las escrituras: no agota el límite por minuto. */
  get(path: string, signedIn: SignedIn): request.Test {
    return request(this.app.getHttpServer())
      .get(path)
      .set('X-Forwarded-For', freshIp())
      .set('Cookie', signedIn.cookie);
  }

  async startSetup(session: SignedIn): Promise<SecondFactorSetupResponse> {
    const response = await postWithSession(this.app, '/v1/auth/mfa/setup', session);
    expect(response.status).toBe(200);
    return secondFactorSetupResponseSchema.parse(response.body);
  }

  /** Cuenta sin segundo factor que lo configura al entrar; devuelve sus códigos. */
  async configuredUser(label: string, options: UserOptions = {}): Promise<ConfiguredUser> {
    const { email, id } = await this.newUser(label, { ...options, withSecondFactor: false });
    const pending = await signInWithPassword(this.app, email);
    const setup = await this.startSetup(pending);
    const code = totpCodeAt(setup.secret, this.clock.now());
    const confirm = await postWithSession(this.app, '/v1/auth/mfa/setup/confirm', pending, {
      code,
    });
    const { recovery_codes: recoveryCodes } = secondFactorConfirmResponseSchema.parse(confirm.body);
    return { email, id, recoveryCodes, secret: setup.secret };
  }

  /** Cada código sirve una vez: el siguiente intento espera al próximo código de 30 segundos. */
  nextCodePeriod(): void {
    this.clock.advance(30_000);
  }
}
