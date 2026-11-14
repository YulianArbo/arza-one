import {
  createdResponseSchema,
  portalTermsSchema,
  type PortalRole,
  type PortalTerms,
} from '@arza/contracts';
import request from 'supertest';
import { expect } from 'vitest';

import { giveRole, type Person } from '../../iam/support/access-scenario.js';
import {
  WEB_ORIGIN,
  createUser,
  freshIp,
  signIn,
  tenantScope,
  uniqueEmail,
} from '../../iam/support/iam-fixtures.js';
import { DeliveryScenario, type DeliveryProject } from '../../project/support/delivery-scenario.js';

// Escenario de las pruebas del portal del cliente (B30): el de entregas de Proyectos (un cliente
// con su firmante, un contrato vigente, un proyecto en ejecución y su acta) más los términos de uso
// y la política de privacidad publicados, y personas del portal ligadas a su empresa cliente.
// Datos ficticios.

const TERMS_BODY =
  'Texto de prueba de los términos del portal. Datos ficticios para las pruebas automáticas de ARZA ONE.';

export interface ClientWorld extends DeliveryProject {
  /** Administrador del cliente, con el correo de su firmante autorizado. */
  readonly admin: Person;
  /** Usuario del cliente, sin proyectos asignados todavía. */
  readonly user: Person;
}

export class PortalScenario extends DeliveryScenario {
  private readonly published = new Set<string>();

  /** Publica los términos del portal y la política de privacidad de la empresa (una vez). */
  async publishTerms(tenantId = this.tenant.id): Promise<void> {
    if (this.published.has(tenantId)) return;
    const officer = await this.person('oficial-datos', ['OFICIAL_DATOS'], { tenantId });
    for (const key of ['portal_terms', 'privacy_policy']) {
      const body = { key, title: `Versión de prueba de ${key}`, body: TERMS_BODY, purposes: [] };
      const created = await this.post('/v1/notices', officer.session, body);
      expect(created.status, created.text).toBe(201);
      const id = createdResponseSchema.parse(created.body).id;
      const published = await this.post(`/v1/notices/${id}/actions/publish`, officer.session).set(
        'If-Match',
        '"1"',
      );
      expect(published.status, published.text).toBe(200);
    }
    this.published.add(tenantId);
  }

  /** Persona del portal de la empresa cliente dada, con su rol y su sesión. */
  async portalPerson(
    role: PortalRole,
    partyId: string,
    options: { readonly email?: string; readonly tenantId?: string } = {},
  ): Promise<Person> {
    const tenantId = options.tenantId ?? this.tenant.id;
    const email = options.email ?? uniqueEmail(role.toLowerCase());
    const admin = role === 'CLIENTE_ADMIN';
    const id = await createUser(this.db, {
      tenantId,
      email,
      kind: 'portal',
      requireSecondFactor: admin,
      withSecondFactor: admin,
    });
    await tenantScope(
      this.db,
      tenantId,
    )((tx) => tx.user.update({ where: { id }, data: { partyId } }));
    await giveRole(this.db, { tenantId, userId: id }, role, { from: this.clock.now() });
    return { id, email, session: await signIn(this.app, email) };
  }

  async terms(person: Person): Promise<PortalTerms> {
    const response = await this.get('/v1/portal/terms', person.session);
    expect(response.status, response.text).toBe(200);
    return portalTermsSchema.parse(response.body);
  }

  /** Lee y acepta los términos vigentes. */
  async accept(person: Person): Promise<void> {
    const ids = (await this.terms(person)).documents.map((document) => document.id);
    const response = await this.post('/v1/portal/terms/acceptance', person.session, {
      notice_ids: ids,
    });
    expect(response.status, response.text).toBe(204);
  }

  /** Persona del portal que ya aceptó los términos. */
  async readyPerson(
    role: PortalRole,
    partyId: string,
    options: { readonly email?: string; readonly tenantId?: string } = {},
  ): Promise<Person> {
    await this.publishTerms(options.tenantId);
    const person = await this.portalPerson(role, partyId, options);
    await this.accept(person);
    return person;
  }

  /**
   * Un cliente con su proyecto en ejecución y su acta en firma, su administrador en el portal (con
   * el correo de su firmante) y un usuario sin proyectos asignados.
   */
  async clientWorld(): Promise<ClientWorld> {
    const delivery = await this.deliveryProject();
    const signerEmail = delivery.client.signers[0]?.email ?? uniqueEmail('firmante');
    const admin = await this.readyPerson('CLIENTE_ADMIN', delivery.client.partyId, {
      email: signerEmail.toLowerCase(),
    });
    const user = await this.readyPerson('CLIENTE_USUARIO', delivery.client.partyId);
    return { ...delivery, admin, user };
  }

  /** Un entregable entregado al cliente: su acta queda en firma. */
  async deliveredDeliverable(world: ClientWorld): Promise<string> {
    const id = await this.create(
      `/v1/projects/${world.projectId}/deliverables`,
      world.leader,
      this.deliverableBody({ milestone_id: world.milestoneId }),
    );
    await this.deliveredToClient(world, id);
    return id;
  }

  /** Lectura del portal que debe responder 200, con su cuerpo. */
  async read<T>(person: Person, path: string): Promise<T> {
    const response = await this.get(path, person.session);
    expect(response.status, `${path}: ${response.text}`).toBe(200);
    return response.body as T;
  }

  portalPost(person: Person, path: string, body: object = {}): request.Test {
    return this.post(path, person.session, body);
  }

  /** PUT sin versión, como asignar proyectos a un usuario. */
  putBody(path: string, person: Person, body: object): request.Test {
    return request(this.app.getHttpServer())
      .put(path)
      .set('Origin', WEB_ORIGIN)
      .set('X-Forwarded-For', freshIp())
      .set('Cookie', person.session.cookie)
      .set('X-CSRF-Token', person.session.session.csrf_token)
      .send(body);
  }

  /** Acciones de la auditoría de un registro, en el orden de la cadena. */
  async auditActionsOf(entityId: string, tenantId = this.tenant.id): Promise<string[]> {
    const events = await tenantScope(
      this.db,
      tenantId,
    )((tx) => tx.auditEvent.findMany({ where: { entityId }, orderBy: { seq: 'asc' } }));
    return events.map((event) => event.action);
  }

  /** Acciones de auditoría que hizo la persona, en orden. */
  async auditedActions(person: Person, tenantId = this.tenant.id): Promise<string[]> {
    const events = await tenantScope(
      this.db,
      tenantId,
    )((tx) => tx.auditEvent.findMany({ where: { actorId: person.id }, orderBy: { seq: 'asc' } }));
    return events.map((event) => event.action);
  }
}
