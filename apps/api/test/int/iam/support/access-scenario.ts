import type { SystemRoleCode } from '@arza/contracts';
import request from 'supertest';

import type { DatabaseService } from '../../../../src/platform/database/database.service.js';
import {
  WEB_ORIGIN,
  freshIp,
  postWithSession,
  signIn,
  tenantScope,
  type SignedIn,
} from './iam-fixtures.js';
import { IamScenario, type UserOptions } from './iam-scenario.js';

// Escenario de las pruebas de roles y permisos (B10): personas con roles del sistema asignados por
// el sistema, como lo haría `pnpm iam:asignar-rol`, y peticiones con su sesión.

export interface Person {
  readonly id: string;
  readonly email: string;
  readonly session: SignedIn;
}

/** Asigna un rol directamente en la base, como el sistema (sin pasar por la API). */
export async function giveRole(
  database: DatabaseService,
  target: { readonly tenantId: string; readonly userId: string },
  code: SystemRoleCode,
  validity: { readonly from: Date; readonly until?: Date | null },
): Promise<string> {
  return tenantScope(
    database,
    target.tenantId,
  )(async (tx) => {
    const role = await tx.role.findFirstOrThrow({ where: { code } });
    const assignment = await tx.userRole.create({
      data: {
        tenantId: target.tenantId,
        userId: target.userId,
        roleId: role.id,
        validFrom: validity.from,
        validUntil: validity.until ?? null,
      },
    });
    return assignment.id;
  });
}

export class AccessScenario extends IamScenario {
  /** Persona con los roles dados y una sesión completa recién abierta. */
  async person(
    label: string,
    roles: readonly SystemRoleCode[],
    options: UserOptions = {},
  ): Promise<Person> {
    const { email, id } = await this.newUser(label, options);
    const tenantId = options.tenantId ?? this.tenant.id;
    for (const role of roles) {
      await giveRole(this.db, { tenantId, userId: id }, role, { from: this.clock.now() });
    }
    return { id, email, session: await signIn(this.app, email) };
  }

  /** Inicia sesión de nuevo, por ejemplo para tener una confirmación de identidad reciente. */
  async refresh(person: Person): Promise<Person> {
    return { ...person, session: await signIn(this.app, person.email) };
  }

  post(path: string, session: SignedIn, body: object = {}): request.Test {
    return postWithSession(this.app, path, session, body);
  }

  patch(path: string, session: SignedIn, body: object, version?: number): request.Test {
    let call = request(this.app.getHttpServer())
      .patch(path)
      .set('Origin', WEB_ORIGIN)
      .set('X-Forwarded-For', freshIp())
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.session.csrf_token);
    if (version !== undefined) call = call.set('If-Match', `"${String(version)}"`);
    return call.send(body);
  }

  async roleId(code: string, tenantId = this.tenant.id): Promise<string> {
    const role = await tenantScope(
      this.db,
      tenantId,
    )((tx) => tx.role.findFirstOrThrow({ where: { code } }));
    return role.id;
  }
}
