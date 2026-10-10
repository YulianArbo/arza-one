import { createdResponseSchema } from '@arza/contracts';
import request from 'supertest';
import { beforeAll, expect } from 'vitest';

import { seedCore } from '../../../../src/modules/core/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import { apiDatabase } from '../../support/integration-database.js';
import { WEB_ORIGIN, freshIp, tenantScope, type SignedIn } from '../../iam/support/iam-fixtures.js';
import { AccessScenario, type Person } from '../../iam/support/access-scenario.js';

// Escenario de las pruebas del núcleo (B12): dos empresas con la semilla del núcleo (festivos,
// horario laboral, catálogos y organigrama provisional) y personas con roles del sistema.

let counter = 0;

/** Sufijo único para códigos y nombres, porque las pruebas comparten la base de datos. */
export function unique(prefix: string): string {
  counter += 1;
  return `${prefix}${String(counter)}`;
}

/** NIT con formato válido que ninguna otra prueba usa: el NIT es único en toda la plataforma. */
export function uniqueTaxId(): string {
  const digits =
    String(Date.now()).slice(-7) + String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `${digits}-${String(counter % 10)}`;
}

export class CoreScenario extends AccessScenario {
  constructor(label: string) {
    super(label);
    beforeAll(async () => {
      await seedCore(apiDatabase(), [this.tenant.id, this.otherTenant.id], systemClock);
    });
  }

  admin(tenantId = this.tenant.id): Promise<Person> {
    return this.person('admin', ['ADMIN_PLATAFORMA'], { tenantId });
  }

  delete(path: string, session: SignedIn, version?: number): request.Test {
    let call = request(this.app.getHttpServer())
      .delete(path)
      .set('Origin', WEB_ORIGIN)
      .set('X-Forwarded-For', freshIp())
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.session.csrf_token);
    if (version !== undefined) call = call.set('If-Match', `"${String(version)}"`);
    return call;
  }

  /** Crea por la API y devuelve el identificador. */
  async create(path: string, person: Person, body: object): Promise<string> {
    const response = await this.post(path, person.session, body);
    expect(response.status, response.text).toBe(201);
    return createdResponseSchema.parse(response.body).id;
  }

  /** Identificador de un proceso por su código. */
  async unitId(code: string, tenantId = this.tenant.id): Promise<string> {
    const unit = await tenantScope(
      this.db,
      tenantId,
    )((tx) => tx.orgUnit.findFirstOrThrow({ where: { code } }));
    return unit.id;
  }
}
