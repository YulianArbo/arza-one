import { envelopeListResponseSchema, type Envelope } from '@arza/contracts';
import request from 'supertest';
import { expect } from 'vitest';

import {
  followUpSignatures,
  processSignatureWork,
  type SignatureFollowUpResult,
  type SignatureWorkResult,
} from '../../../../src/modules/contract/index.js';
import { APP_URL } from '../../crm/support/quote-scenario.js';
import { samplePdf, storage } from '../../doc/support/file-scenario.js';
import type { Person } from '../../iam/support/access-scenario.js';
import { WEB_ORIGIN, freshIp, tenantScope } from '../../iam/support/iam-fixtures.js';
import { organizationBody } from '../../party/support/party-scenario.js';
import { apiDatabase } from '../../support/integration-database.js';
import { ContractScenario } from './contract-scenario.js';

// Escenario de las pruebas de firma electrónica (B25): el de Contratos más un cliente con su firmante
// autorizado (con correo y documento) y su conocimiento aprobado, la Dirección vinculada a su persona
// en Terceros, y un worker de prueba que guarda los correos en vez de enviarlos y «une» los PDF.
// Datos ficticios.

export interface SignatureMailCopy {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export interface SigningClient {
  readonly partyId: string;
  readonly signers: readonly { readonly personId: string; readonly email: string }[];
}

export interface Prepared {
  readonly contractId: string;
  readonly envelopeId: string;
  readonly client: SigningClient;
  readonly director: Person;
}

export class SignatureScenario extends ContractScenario {
  readonly signatureMails: SignatureMailCopy[] = [];

  /** Persona del cliente con correo y cédula, para firmar. */
  private async signerPerson(sales: Person, label: string) {
    const email = `${label}-${crypto.randomUUID().slice(0, 8)}@cliente.test`;
    const body = await this.personWithConsent({ email, first_name: label });
    return { personId: await this.party(sales, body), email };
  }

  /** Cliente organización con firmantes autorizados y su conocimiento aprobado por la Dirección. */
  async signingClient(sales: Person, signers = 1, verified = true): Promise<SigningClient> {
    const body = organizationBody({ address: 'Calle 10 # 20-30', email: 'compras@cliente.test' });
    const partyId = await this.party(sales, body);
    const people = [];
    for (let index = 0; index < signers; index += 1) {
      const person = await this.signerPerson(sales, `Firmante${String(index + 1)}`);
      const contact = { person_id: person.personId, can_sign: true, is_primary: index === 0 };
      const added = await this.post(`/v1/parties/${partyId}/contacts`, sales.session, contact);
      expect(added.status, added.text).toBe(201);
      people.push(person);
    }
    if (verified) await this.approveDueDiligence(sales, partyId);
    return { partyId, signers: people };
  }

  async approveDueDiligence(sales: Person, partyId: string): Promise<void> {
    const review = { risk_level: 'low', summary: 'Revisión de RUT, cámara de comercio y listas.' };
    const id = await this.create(`/v1/parties/${partyId}/due-diligence`, sales, review);
    const reviewer = await this.person('revisor', ['DIRECCION']);
    const path = `/v1/parties/${partyId}/due-diligence/${id}/actions/approve`;
    const approved = await this.post(path, reviewer.session, {});
    expect(approved.status, approved.text).toBe(204);
  }

  /** Persona de la Dirección vinculada a su persona en Terceros, con su cédula. */
  async signingDirector(sales: Person, tenantId = this.tenant.id): Promise<Person> {
    const director = await this.director(tenantId);
    const body = await this.personWithConsent({ first_name: 'Directora' }, tenantId);
    const partyId = await this.party(sales, body);
    await tenantScope(
      this.db,
      tenantId,
    )((tx) => tx.user.update({ where: { id: director.id }, data: { partyId } }));
    return director;
  }

  /** Contrato aprobado, con PDF, de un cliente listo para firmar. */
  async approvedFor(sales: Person, client: SigningClient): Promise<string> {
    const body = this.body(await this.templateId(sales), client.partyId);
    const id = await this.create('/v1/contracts', sales, body);
    expect((await this.contractStep(sales, id, 'submit')).status).toBe(204);
    const approver = await this.director();
    expect((await this.contractStep(approver, id, 'approve', {})).status).toBe(204);
    await this.renderPdfs();
    return id;
  }

  envelopeBody(
    contractId: string,
    client: SigningClient,
    director: Person,
    overrides: object = {},
  ): Record<string, unknown> {
    return {
      source: 'contract',
      source_id: contractId,
      client_signer_ids: client.signers.map((signer) => signer.personId),
      company_signer_id: director.id,
      expires_on: this.day(15),
      message: 'Quedamos atentos a su firma.',
      ...overrides,
    };
  }

  /** Contrato aprobado con su proceso de firma preparado por Comercial (aún sin enviar). */
  async prepared(sales: Person, signers = 1): Promise<Prepared> {
    const client = await this.signingClient(sales, signers);
    const director = await this.signingDirector(sales);
    const contractId = await this.approvedFor(sales, client);
    const body = this.envelopeBody(contractId, client, director);
    const envelopeId = await this.create('/v1/signature-envelopes', sales, body);
    return { contractId, envelopeId, client, director };
  }

  async envelopes(person: Person, contractId: string): Promise<Envelope[]> {
    const path = `/v1/signature-envelopes?source=contract&source_id=${contractId}`;
    const response = await this.get(path, person.session);
    expect(response.status, response.text).toBe(200);
    return envelopeListResponseSchema.parse(response.body).items;
  }

  async envelope(person: Person, contractId: string): Promise<Envelope> {
    const [first] = await this.envelopes(person, contractId);
    if (first === undefined) throw new Error('El contrato no tiene proceso de firma');
    return first;
  }

  /** Enviar a firma con la versión vigente y una llave de operación. */
  async sendEnvelope(
    person: Person,
    prepared: Pick<Prepared, 'contractId' | 'envelopeId'>,
    key = crypto.randomUUID(),
  ): Promise<request.Response> {
    const { version } = await this.envelope(person, prepared.contractId);
    const path = `/v1/signature-envelopes/${prepared.envelopeId}/actions/send`;
    return this.action(path, person, version, {}).set('Idempotency-Key', key);
  }

  /** Preparado y enviado: el primer firmante ya recibió su enlace. */
  async sentEnvelope(sales: Person, signers = 1): Promise<Prepared> {
    const prepared = await this.prepared(sales, signers);
    const response = await this.sendEnvelope(prepared.director, prepared);
    expect(response.status, response.text).toBe(204);
    await this.signatureWork();
    return prepared;
  }

  private deps() {
    return {
      database: apiDatabase(),
      clock: this.clock,
      storage: storage(),
      convertHtml: async () => Promise.resolve(samplePdf('Firmas')),
      mergePdfs: async (pdfs: readonly Buffer[]) => Promise.resolve(Buffer.concat([...pdfs])),
      mailer: {
        send: async (mail: SignatureMailCopy) => {
          this.signatureMails.push(mail);
          return Promise.resolve();
        },
      },
      appUrl: APP_URL,
    };
  }

  /** Una pasada del worker: correos, códigos y documentos firmados. */
  async signatureWork(): Promise<SignatureWorkResult> {
    return processSignatureWork(this.deps());
  }

  async signatureFollowUp(): Promise<SignatureFollowUpResult> {
    return followUpSignatures(this.deps());
  }

  /** El último correo que recibió la dirección dada. */
  lastMailTo(email: string): SignatureMailCopy {
    const mail = this.signatureMails.filter((item) => item.to === email).at(-1);
    if (mail === undefined) throw new Error(`No llegó correo a ${email}`);
    return mail;
  }

  /** La llave del último enlace que le llegó a esa dirección. */
  linkOf(email: string): string {
    const match = /#token=([A-Za-z0-9_-]+)/u.exec(this.lastMailTo(email).text);
    if (match?.[1] === undefined) throw new Error('El correo no trae el enlace');
    return match[1];
  }

  /** Pide el código, lo «recibe» en el correo y lo valida: devuelve la confirmación. */
  async ticketFor(email: string): Promise<{ token: string; ticket: string }> {
    const token = this.linkOf(email);
    expect((await this.publicSign('code', { token })).status).toBe(204);
    await this.signatureWork();
    const code = /es: ([0-9]{6})/u.exec(this.lastMailTo(email).text)?.[1];
    if (code === undefined) throw new Error('No llegó el código');
    const verified = await this.publicSign('verify-code', { token, code });
    expect(verified.status, verified.text).toBe(200);
    return { token, ticket: (verified.body as { ticket: string }).ticket };
  }

  /** Quien firma por el cliente: pide el código, lo valida y firma. */
  async clientSigns(email: string): Promise<void> {
    const { token, ticket } = await this.ticketFor(email);
    const signed = await this.publicSign('sign', { token, ticket, accept: true });
    expect(signed.status, signed.text).toBe(204);
    await this.signatureWork();
  }

  /** La Dirección firma por la empresa, con una confirmación de identidad reciente. */
  async companySigns(director: Person, envelopeId: string): Promise<request.Response> {
    const fresh = await this.refresh(director);
    const path = `/v1/signature-envelopes/${envelopeId}/actions/sign`;
    return this.post(path, fresh.session, { accept: true });
  }

  /** Petición de la página de firma, sin sesión. */
  publicSign(path: string, body: object): request.Test {
    return request(this.app.getHttpServer())
      .post(`/v1/public/signatures/${path}`)
      .set('Origin', WEB_ORIGIN)
      .set('X-Forwarded-For', freshIp())
      .set('User-Agent', 'Navegador de prueba')
      .send(body);
  }

  verify(body: object): request.Test {
    return request(this.app.getHttpServer())
      .post('/v1/public/verifications')
      .set('Origin', WEB_ORIGIN)
      .set('X-Forwarded-For', freshIp())
      .send(body);
  }

  /** El PDF firmado, tal como se guardó. */
  async signedPdf(envelopeId: string): Promise<Buffer> {
    const file = await tenantScope(
      this.db,
      this.tenant.id,
    )(async (tx) => {
      const envelope = await tx.sigEnvelope.findFirstOrThrow({ where: { id: envelopeId } });
      return tx.file.findFirstOrThrow({ where: { id: envelope.signedFileId ?? '' } });
    });
    return storage().read(file.storageKey);
  }
}
