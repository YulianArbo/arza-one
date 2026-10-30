import {
  contractDetailSchema,
  contractOptionsSchema,
  type ContractClauseRequest,
  type ContractDetail,
  type ContractOptions,
} from '@arza/contracts';
import type request from 'supertest';
import { beforeAll, expect } from 'vitest';

import {
  followUpContracts,
  renderPendingContracts,
  seedContracts,
  type ContractFollowUpResult,
} from '../../../../src/modules/contract/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import { QuoteScenario } from '../../crm/support/quote-scenario.js';
import { samplePdf, storage } from '../../doc/support/file-scenario.js';
import type { Person } from '../../iam/support/access-scenario.js';
import { tenantScope } from '../../iam/support/iam-fixtures.js';
import { organizationBody } from '../../party/support/party-scenario.js';
import { apiDatabase } from '../../support/integration-database.js';

// Escenario de las pruebas de Contratos (B24): el de las cotizaciones (para tener una cotización
// aceptada) más la biblioteca de cláusulas, las plantillas CT-COM y OS-COM y los flujos de
// aprobación y de vencimiento, y un worker de prueba que genera los PDF. Datos ficticios.

export const DAY = 86_400_000;

export class ContractScenario extends QuoteScenario {
  constructor(label: string) {
    super(label);
    beforeAll(async () => {
      await seedContracts(apiDatabase(), [this.tenant.id, this.otherTenant.id], systemClock);
    });
  }

  async options(person: Person, query = ''): Promise<ContractOptions> {
    const response = await this.get(`/v1/contracts/options${query}`, person.session);
    expect(response.status, response.text).toBe(200);
    return contractOptionsSchema.parse(response.body);
  }

  async templateId(person: Person, code = 'CT-COM-001'): Promise<string> {
    const template = (await this.options(person)).templates.find((item) => item.code === code);
    if (template === undefined) throw new Error(`Falta la plantilla ${code}`);
    return template.id;
  }

  /** Cliente organización con documento y dirección, como lo exige un contrato. */
  async client(person: Person): Promise<string> {
    return this.party(
      person,
      organizationBody({ address: 'Calle 10 # 20-30', email: 'compras@example.com' }),
    );
  }

  body(templateId: string, partyId: string, overrides: object = {}): Record<string, unknown> {
    return {
      template_id: templateId,
      party_id: partyId,
      quote_id: null,
      ...this.data(),
      ...overrides,
    };
  }

  /** Los datos del contrato, sin plantilla ni cliente, como se guardan con PUT. */
  data(overrides: object = {}): Record<string, unknown> {
    return {
      title: 'Portal de clientes',
      object: 'desarrollar el portal de autogestión de los clientes',
      value: '12000000.00',
      payment_terms: '50 % al iniciar y 50 % a la entrega',
      starts_on: this.day(0),
      ends_on: this.day(365),
      renewal: 'by_agreement',
      responsible_id: null,
      client_signer_name: 'Laura Gómez',
      client_signer_document: 'CC 43000000',
      ...overrides,
    };
  }

  /** Contrato en borrador desde la plantilla, para un cliente nuevo. */
  async contract(person: Person, overrides: object = {}, code = 'CT-COM-001'): Promise<string> {
    const body = this.body(
      await this.templateId(person, code),
      await this.client(person),
      overrides,
    );
    return this.create('/v1/contracts', person, body);
  }

  async contractDetail(person: Person, id: string): Promise<ContractDetail> {
    const response = await this.get(`/v1/contracts/${id}`, person.session);
    expect(response.status, response.text).toBe(200);
    return contractDetailSchema.parse(response.body);
  }

  /** Paso del contrato con la versión vigente. */
  async contractStep(
    person: Person,
    id: string,
    action: string,
    body: object = {},
  ): Promise<request.Response> {
    const contract = await this.contractDetail(person, id);
    return this.action(`/v1/contracts/${id}/actions/${action}`, person, contract.version, body);
  }

  /** Guarda el borrador con la versión vigente: los datos y las cláusulas que se pidan. */
  async saveContract(person: Person, id: string, body: object): Promise<request.Response> {
    const contract = await this.contractDetail(person, id);
    return this.put(`/v1/contracts/${id}`, person, body, contract.version);
  }

  /** Las cláusulas del contrato tal como están, para cambiarles algo y guardar. */
  async clausesOf(person: Person, id: string): Promise<ContractClauseRequest[]> {
    const contract = await this.contractDetail(person, id);
    return contract.clauses.map((clause) => ({
      clause_key: clause.clause_key,
      title: clause.title,
      body: clause.origin === 'library' ? null : clause.body,
    }));
  }

  /** Una pasada del worker: los PDF de los contratos y otrosíes aprobados. */
  async renderPdfs(): Promise<number> {
    return renderPendingContracts({
      database: apiDatabase(),
      clock: this.clock,
      storage: storage(),
      convertHtml: async () => Promise.resolve(samplePdf('Contrato')),
    });
  }

  async followUp(): Promise<ContractFollowUpResult> {
    return followUpContracts({
      database: apiDatabase(),
      clock: this.clock,
      storage: storage(),
      convertHtml: async () => Promise.resolve(samplePdf('Contrato')),
    });
  }

  /** Borrador → en revisión → aprobado por la Dirección, con su PDF listo. */
  async approvedContract(sales: Person, overrides: object = {}, code?: string): Promise<string> {
    const id = await this.contract(sales, overrides, code);
    expect((await this.contractStep(sales, id, 'submit')).status).toBe(204);
    const director = await this.director();
    const approved = await this.contractStep(director, id, 'approve', {});
    expect(approved.status, approved.text).toBe(204);
    await this.renderPdfs();
    return id;
  }

  /** Aprobado y con la copia firmada registrada: vigente. */
  async activeContract(sales: Person, overrides: object = {}): Promise<string> {
    const id = await this.approvedContract(sales, overrides);
    const response = await this.contractStep(sales, id, 'register-signature', {
      file_id: await this.signedCopy(sales),
      signed_on: this.day(0),
    });
    expect(response.status, response.text).toBe(204);
    return id;
  }

  /** PDF escaneado que la persona subió y que pasó el antivirus, guardado directamente. */
  async signedCopy(person: Person, mimeType = 'application/pdf'): Promise<string> {
    const file = await this.db.withTenant({ tenantId: this.tenant.id, userId: person.id }, (tx) =>
      tx.file.create({
        data: {
          tenantId: this.tenant.id,
          storageKey: `${this.tenant.id}/${crypto.randomUUID()}`,
          fileName: 'contrato-firmado.pdf',
          mimeType,
          sizeBytes: 2048,
          scanStatus: 'available',
          sha256: '1'.repeat(64),
          scannedAt: new Date(),
        },
      }),
    );
    return file.id;
  }

  /** Eventos de auditoría de un registro, en orden. */
  async auditActions(entityId: string): Promise<string[]> {
    const events = await tenantScope(
      this.db,
      this.tenant.id,
    )((tx) => tx.auditEvent.findMany({ where: { entityId }, orderBy: { occurredAt: 'asc' } }));
    return events.map((event) => event.action);
  }
}
